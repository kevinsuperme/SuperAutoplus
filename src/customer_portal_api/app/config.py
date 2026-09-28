from __future__ import annotations

import os


class Settings:
    app_name: str = os.getenv("PORTAL_APP_NAME", "Customer Portal API")
    app_version: str = "0.2.0"
    jwt_secret: str = os.getenv("PORTAL_JWT_SECRET", "")
    access_token_ttl_seconds: int = int(os.getenv("PORTAL_ACCESS_TOKEN_TTL_SECONDS", "7200"))
    refresh_token_ttl_seconds: int = int(os.getenv("PORTAL_REFRESH_TOKEN_TTL_SECONDS", str(30 * 24 * 3600)))
    seed_admin_username: str = os.getenv("PORTAL_ADMIN_USERNAME", "")
    seed_admin_password: str = os.getenv("PORTAL_ADMIN_PASSWORD", "")
    seed_admin_email: str = os.getenv("PORTAL_ADMIN_EMAIL", "")
    cors_origins: list[str] = [item.strip() for item in os.getenv("PORTAL_CORS_ORIGINS", "").split(",") if item.strip()]

    def validate_for_runtime(self) -> None:
        """Reject credentials and CORS settings that are unsafe for a running service."""
        required = {
            "PORTAL_JWT_SECRET": self.jwt_secret,
            "PORTAL_ADMIN_USERNAME": self.seed_admin_username,
            "PORTAL_ADMIN_PASSWORD": self.seed_admin_password,
            "PORTAL_ADMIN_EMAIL": self.seed_admin_email,
            "PORTAL_CORS_ORIGINS": ",".join(self.cors_origins),
        }
        missing = [name for name, value in required.items() if not value.strip()]
        if missing:
            raise RuntimeError(f"Missing required portal settings: {', '.join(missing)}")
        placeholders = {
            "PORTAL_JWT_SECRET": "replace-with-a-long-random-secret",
            "PORTAL_ADMIN_USERNAME": "replace-admin",
            "PORTAL_ADMIN_PASSWORD": "replace-with-a-strong-password",
            "PORTAL_ADMIN_EMAIL": "admin@example.com",
            "PORTAL_CORS_ORIGINS": "https://portal.example.com",
        }
        unchanged = [name for name, value in required.items() if value.strip() == placeholders.get(name)]
        if unchanged:
            raise RuntimeError(f"Replace portal template values before startup: {', '.join(unchanged)}")
        if len(self.jwt_secret) < 32:
            raise RuntimeError("PORTAL_JWT_SECRET must contain at least 32 characters")
        if len(self.seed_admin_password) < 12:
            raise RuntimeError("PORTAL_ADMIN_PASSWORD must contain at least 12 characters")
        if "*" in self.cors_origins:
            raise RuntimeError("PORTAL_CORS_ORIGINS must not use '*' in a deployed portal")


settings = Settings()
