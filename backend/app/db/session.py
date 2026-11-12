from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base
from backend.app.core.config import settings

Base = declarative_base()

# Engine creation
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    from sqlalchemy import inspect, text
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Preserve the existing optional-column upgrade without deliberately failing DDL.
        # Catching an error inside this transaction leaves PostgreSQL's transaction aborted.
        existing = await conn.run_sync(lambda sync: {
            column["name"] for column in inspect(sync).get_columns("documents")
        })
        for name, definition in {
            "subject_id": "VARCHAR(64)",
            "doc_type": "VARCHAR(50) DEFAULT 'source_material'",
            "content_hash": "VARCHAR(128)",
            "extracted_text": "TEXT",
        }.items():
            if name not in existing:
                await conn.execute(text(f"ALTER TABLE documents ADD COLUMN {name} {definition}"))

        # Subject-aware competency snapshots (nullable; historical rows remain global).
        snap_cols = await conn.run_sync(lambda sync: {
            column["name"] for column in inspect(sync).get_columns("student_competency_snapshots")
        }) if await conn.run_sync(lambda sync: inspect(sync).has_table("student_competency_snapshots")) else set()
        for name, definition in {
            "subject_id": "VARCHAR(64)",
            "source_assessment_id": "VARCHAR(64)",
            "source_submission_id": "VARCHAR(64)",
        }.items():
            if snap_cols and name not in snap_cols:
                await conn.execute(
                    text(f"ALTER TABLE student_competency_snapshots ADD COLUMN {name} {definition}")
                )


