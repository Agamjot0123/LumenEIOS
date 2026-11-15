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

        # Additive optional columns for databases created by older versions (never dropped or rewritten).
        additive = {
            "question_bank_items": {"topic": "VARCHAR(255)", "grade": "INTEGER"},
            "users": {"username": "VARCHAR(100)"},
            "students": {"admission_no": "VARCHAR(32)", "date_of_birth": "VARCHAR(10)"},
        }
        for table, columns in additive.items():
            if not await conn.run_sync(lambda sync, t=table: inspect(sync).has_table(t)):
                continue
            present = await conn.run_sync(lambda sync, t=table: {c["name"] for c in inspect(sync).get_columns(t)})
            for name, definition in columns.items():
                if name not in present:
                    await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))
                    unique = "UNIQUE " if (table, name) == ("users", "username") else ""
                    await conn.execute(text(f"CREATE {unique}INDEX IF NOT EXISTS ix_{table}_{name} ON {table} ({name})"))

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


