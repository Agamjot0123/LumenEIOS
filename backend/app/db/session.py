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
    # Register all mapped tables explicitly, independent of route import order.
    from backend.app.db import base  # noqa: F401
    from sqlalchemy import inspect, text
    async with engine.begin() as conn:
        # learning_* tables (LearnSphere, assessment results/Panchapadi, interventions) are owned by the
        # Alembic migrations in production. Local SQLite databases are never migrated, which left
        # LearnSphere, guidance recovery and interventions failing with "no such table". On SQLite
        # create them here too (create_all only adds missing tables; existing data is untouched).
        local_sqlite = conn.dialect.name == "sqlite"
        await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=[
            t for t in Base.metadata.sorted_tables if local_sqlite or not t.name.startswith("learning_")]))
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

        # Question-bank topics (nullable; older questions stay untagged).
        qb_cols = await conn.run_sync(lambda sync: {
            column["name"] for column in inspect(sync).get_columns("question_bank_items")
        }) if await conn.run_sync(lambda sync: inspect(sync).has_table("question_bank_items")) else set()
        if qb_cols and "topic" not in qb_cols:
            await conn.execute(text("ALTER TABLE question_bank_items ADD COLUMN topic VARCHAR(255)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_question_bank_items_topic ON question_bank_items (topic)"))

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


