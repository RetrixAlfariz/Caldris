import pytest

from caldris.workspace import evaluate_workspace


def test_workspace_resolves_dependencies() -> None:
    result = evaluate_workspace(["a = 5", "b = 3", "c = a + b"])

    assert result["variables"]["c"] == "8"


def test_workspace_reacts_to_changed_source_value() -> None:
    first = evaluate_workspace(["a = 5", "b = 3", "c = a + b"])
    second = evaluate_workspace(["a = 7", "b = 3", "c = a + b"])

    assert first["variables"]["c"] == "8"
    assert second["variables"]["c"] == "10"


def test_workspace_is_not_line_order_dependent() -> None:
    result = evaluate_workspace(["c = a + b", "b = 3", "a = 5"])

    assert result["variables"]["c"] == "8"


def test_workspace_rejects_circular_dependencies() -> None:
    with pytest.raises(ValueError, match="Circular dependency"):
        evaluate_workspace(["a = b + 1", "b = a + 1"])
