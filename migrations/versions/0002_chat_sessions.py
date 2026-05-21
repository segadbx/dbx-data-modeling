"""chat_sessions table + link conversations by session_id

Revision ID: 0002_chat_sessions
Revises: 0001_init
Create Date: 2026-05-26
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0002_chat_sessions"
down_revision: str | None = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("created_by", sa.Text, nullable=False),
        sa.Column("title", sa.Text, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("last_message_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("proposal_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["proposal_id"], ["proposals.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_chat_sessions_created_by", "chat_sessions", ["created_by"])
    op.create_index(
        "ix_chat_sessions_owner_recent",
        "chat_sessions",
        ["created_by", sa.text("last_message_at DESC")],
    )

    # conversations.proposal_id was NOT NULL with an FK to proposals; a chat may exist
    # before any proposal is produced, so relax the constraint and add session_id.
    op.add_column(
        "conversations",
        sa.Column("session_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_conversations_session_id",
        "conversations",
        "chat_sessions",
        ["session_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column("conversations", "proposal_id", nullable=True)
    op.create_index(
        "ix_conversations_session_turn",
        "conversations",
        ["session_id", "turn"],
    )


def downgrade() -> None:
    op.drop_index("ix_conversations_session_turn", table_name="conversations")
    op.alter_column("conversations", "proposal_id", nullable=False)
    op.drop_constraint("fk_conversations_session_id", "conversations", type_="foreignkey")
    op.drop_column("conversations", "session_id")

    op.drop_index("ix_chat_sessions_owner_recent", table_name="chat_sessions")
    op.drop_index("ix_chat_sessions_created_by", table_name="chat_sessions")
    op.drop_table("chat_sessions")
