"""initial: proposals, conversations, approvals, langgraph_checkpoints

Revision ID: 0001_init
Revises:
Create Date: 2026-05-11
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0001_init"
down_revision: str | None = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";")  # for gen_random_uuid()

    op.create_table(
        "proposals",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="draft"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("parent_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("model_jsonb", sa.dialects.postgresql.JSONB, nullable=False),
        sa.Column("ddl_text", sa.Text, nullable=True),
        sa.ForeignKeyConstraint(["parent_id"], ["proposals.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_proposals_status", "proposals", ["status"])
    op.create_index("ix_proposals_created_by", "proposals", ["created_by"])

    op.create_table(
        "conversations",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("proposal_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("turn", sa.Integer, nullable=False),
        sa.Column("role", sa.Text, nullable=False),  # user | assistant | tool
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("tool_calls_jsonb", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["proposal_id"], ["proposals.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_conversations_proposal_turn", "conversations", ["proposal_id", "turn"])

    op.create_table(
        "approvals",
        sa.Column("proposal_id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("approved_by", sa.Text, nullable=False),
        sa.Column("approved_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("applied_run_id", sa.BigInteger, nullable=True),
        sa.Column("applied_status", sa.Text, nullable=True),
        sa.Column("applied_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["proposal_id"], ["proposals.id"], ondelete="CASCADE"),
    )

    # LangGraph Postgres checkpointer schema is created by the library at runtime via
    # `await checkpointer.setup()`; we don't pre-create it here to avoid drift with the
    # checkpointer's internal version.


def downgrade() -> None:
    op.drop_table("approvals")
    op.drop_table("conversations")
    op.drop_table("proposals")
