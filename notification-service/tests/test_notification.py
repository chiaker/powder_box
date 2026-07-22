import json
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.main import handle_message


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "notification-service"


async def test_handle_message_sends_email():
    with patch("app.main.aiosmtplib.send", new=AsyncMock()) as send_mock:
        body = json.dumps({"to": "user@example.com", "subject": "Снег!", "text": "10 см"}).encode()
        await handle_message(body)

    send_mock.assert_awaited_once()
    msg = send_mock.await_args.args[0]
    assert msg["To"] == "user@example.com"
    assert msg["Subject"] == "Снег!"
    assert "10 см" in msg.get_content()


async def test_handle_message_html_alternative():
    with patch("app.main.aiosmtplib.send", new=AsyncMock()) as send_mock:
        body = json.dumps({"to": "u@e.com", "subject": "s", "text": "t", "html": "<b>t</b>"}).encode()
        await handle_message(body)

    msg = send_mock.await_args.args[0]
    assert msg.is_multipart()


async def test_handle_message_malformed_json_does_not_raise():
    with patch("app.main.aiosmtplib.send", new=AsyncMock()) as send_mock:
        await handle_message(b"not-json{{{")
    send_mock.assert_not_awaited()


async def test_handle_message_missing_fields_skipped():
    with patch("app.main.aiosmtplib.send", new=AsyncMock()) as send_mock:
        await handle_message(json.dumps({"subject": "no-to"}).encode())
        await handle_message(json.dumps({"to": "no-subject@e.com"}).encode())
    send_mock.assert_not_awaited()


async def test_handle_message_smtp_failure_does_not_raise():
    with patch("app.main.aiosmtplib.send", new=AsyncMock(side_effect=ConnectionError("down"))):
        body = json.dumps({"to": "u@e.com", "subject": "s", "text": "t"}).encode()
        await handle_message(body)  # не должно бросить
