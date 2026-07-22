import json

import httpx
import pytest

from pairs_engine.cli import main
from pairs_engine.publish import (
    ARTEFACT_ROUTE,
    PublishConfig,
    PublishError,
    mint_token,
    newest_artefact,
    publish_artefact,
)

CONFIG = PublishConfig(
    api_url="https://api.example.test",
    client_id="client-123",
    refresh_token="refresh-abc",
    region="ap-southeast-2",
)


def token_handler(request):
    assert request.url.host == "cognito-idp.ap-southeast-2.amazonaws.com"
    body = json.loads(request.content)
    assert body["AuthFlow"] == "REFRESH_TOKEN_AUTH"
    assert body["ClientId"] == "client-123"
    assert body["AuthParameters"]["REFRESH_TOKEN"] == "refresh-abc"
    return httpx.Response(200, json={"AuthenticationResult": {"IdToken": "id-token-xyz"}})


def test_mint_token_exchanges_the_refresh_token():
    token = mint_token(CONFIG, transport=httpx.MockTransport(token_handler))
    assert token == "id-token-xyz"


def test_mint_token_surfaces_a_rejected_refresh():
    def handler(request):
        return httpx.Response(400, json={"__type": "NotAuthorizedException"})

    with pytest.raises(PublishError, match="runbook"):
        mint_token(CONFIG, transport=httpx.MockTransport(handler))


def test_publish_puts_the_artefact_with_the_minted_token(tmp_path):
    artefact = tmp_path / "pair-scan-2026-07-21.json"
    artefact.write_text('{"artefact": "pairScanReport"}')

    def handler(request):
        if request.url.host.startswith("cognito-idp"):
            return token_handler(request)
        assert request.method == "PUT"
        assert request.url.path == ARTEFACT_ROUTE
        assert request.headers["Authorization"] == "Bearer id-token-xyz"
        assert json.loads(request.content)["artefact"] == "pairScanReport"
        return httpx.Response(200, json={"runDate": "2026-07-21", "receivedAt": "now"})

    stored = publish_artefact(artefact, CONFIG, transport=httpx.MockTransport(handler))
    assert stored["runDate"] == "2026-07-21"


def test_publish_surfaces_the_error_envelope(tmp_path):
    artefact = tmp_path / "pair-scan-2026-07-21.json"
    artefact.write_text("{}")

    def handler(request):
        if request.url.host.startswith("cognito-idp"):
            return token_handler(request)
        return httpx.Response(
            400,
            json={"error": {"code": "invalid_request", "message": "schema mismatch", "details": [], "requestId": "req_1"}},
        )

    with pytest.raises(PublishError, match="invalid_request"):
        publish_artefact(artefact, CONFIG, transport=httpx.MockTransport(handler))


def test_newest_artefact_sorts_run_dates_lexicographically(tmp_path):
    (tmp_path / "pair-scan-2026-07-01.json").write_text("{}")
    (tmp_path / "pair-scan-2026-07-21.json").write_text("{}")
    assert newest_artefact(tmp_path).name == "pair-scan-2026-07-21.json"
    assert newest_artefact(tmp_path / "empty-dir-that-does-not-exist") is None


def test_cli_publish_without_credentials_points_at_the_runbook(monkeypatch, capsys):
    for name in (
        "PLAINSIGHT_API_URL",
        "PLAINSIGHT_COGNITO_CLIENT_ID",
        "PLAINSIGHT_COGNITO_REFRESH_TOKEN",
    ):
        monkeypatch.delenv(name, raising=False)
    exit_code = main(["publish"])
    assert exit_code == 2
    err = capsys.readouterr().err
    assert "PLAINSIGHT_API_URL" in err
    assert "runbook" in err


def test_cli_publish_with_no_artefacts_fails_loudly(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("PLAINSIGHT_API_URL", "https://api.example.test")
    monkeypatch.setenv("PLAINSIGHT_COGNITO_CLIENT_ID", "client-123")
    monkeypatch.setenv("PLAINSIGHT_COGNITO_REFRESH_TOKEN", "refresh-abc")
    exit_code = main(["publish", "--out-dir", str(tmp_path)])
    assert exit_code == 1
    assert "run scan first" in capsys.readouterr().err
