"""
Auth helpers for the FastAPI backend.

Databricks Apps inject:
  * X-Forwarded-Access-Token  — short-lived OAuth token for the *user* (OBO)
  * X-Forwarded-User           — user id

We use those for catalog/proposals reads. For everything else (Model Serving, Jobs,
Lakebase writes) we fall back to the App SP's default credentials from the SDK.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from fastapi import Header, HTTPException


@dataclass
class CurrentUser:
    user_name: str
    obo_token: str


@lru_cache(maxsize=1)
def _local_dev_user() -> CurrentUser:
    """Resolve a CurrentUser from the local SDK config when running outside the
    Databricks Apps platform (which is what normally injects the X-Forwarded-* headers).

    Gated on LOCAL_DEV_AUTH=1 so it can never short-circuit auth in production. The
    token is read from the SDK config in-process and is never logged or echoed.
    """
    from databricks.sdk import WorkspaceClient

    w = WorkspaceClient()
    token = w.config.token or w.config.oauth_token().access_token
    user_name = w.current_user.me().user_name
    return CurrentUser(user_name=user_name, obo_token=token)


def _maybe_local_dev() -> CurrentUser | None:
    if os.environ.get("LOCAL_DEV_AUTH") == "1":
        return _local_dev_user()
    return None


def current_user(
    x_forwarded_user: str | None = Header(default=None),
    x_forwarded_access_token: str | None = Header(default=None),
) -> CurrentUser:
    if not x_forwarded_user or not x_forwarded_access_token:
        local = _maybe_local_dev()
        if local is not None:
            return local
        raise HTTPException(status_code=401, detail="Missing user identity headers")
    return CurrentUser(user_name=x_forwarded_user, obo_token=x_forwarded_access_token)


def optional_user(
    x_forwarded_user: str | None = Header(default=None),
    x_forwarded_access_token: str | None = Header(default=None),
) -> CurrentUser | None:
    if not x_forwarded_user or not x_forwarded_access_token:
        return _maybe_local_dev()
    return CurrentUser(user_name=x_forwarded_user, obo_token=x_forwarded_access_token)
