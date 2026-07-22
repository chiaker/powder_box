"""email confirmation columns on users

Revision ID: 20260722_0002
Revises: 20260306_0001
Create Date: 2026-07-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260722_0002"
down_revision: Union[str, None] = "20260306_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("users")}

    if "email_confirmed" not in columns:
        op.add_column("users", sa.Column("email_confirmed", sa.Boolean(), nullable=False, server_default="0"))
    if "confirm_token_hash" not in columns:
        op.add_column("users", sa.Column("confirm_token_hash", sa.String(length=64), nullable=True))
    if "confirm_token_expires_at" not in columns:
        op.add_column("users", sa.Column("confirm_token_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("users")}

    for name in ("confirm_token_expires_at", "confirm_token_hash", "email_confirmed"):
        if name in columns:
            op.drop_column("users", name)
