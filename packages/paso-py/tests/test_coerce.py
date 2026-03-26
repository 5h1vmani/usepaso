import pytest
from usepaso.utils.coerce import coerce_value as _coerce_value


class TestCoerceInteger:
    def test_parses_valid_integers(self):
        assert _coerce_value("42", "integer", "x") == 42
        assert _coerce_value("-7", "integer", "x") == -7
        assert _coerce_value("0", "integer", "x") == 0

    def test_rejects_infinity(self):
        with pytest.raises(ValueError, match="must be an integer"):
            _coerce_value("Infinity", "integer", "x")

    def test_rejects_nan(self):
        with pytest.raises(ValueError, match="must be an integer"):
            _coerce_value("NaN", "integer", "x")

    def test_rejects_hex(self):
        with pytest.raises(ValueError, match="must be an integer"):
            _coerce_value("0xFF", "integer", "x")

    def test_rejects_scientific_notation(self):
        with pytest.raises(ValueError, match="must be an integer"):
            _coerce_value("1e10", "integer", "x")

    def test_rejects_floats(self):
        with pytest.raises(ValueError, match="must be an integer"):
            _coerce_value("3.14", "integer", "x")


class TestCoerceNumber:
    def test_parses_valid_numbers(self):
        assert _coerce_value("3.14", "number", "x") == pytest.approx(3.14)
        assert _coerce_value("-2.5", "number", "x") == pytest.approx(-2.5)
        assert _coerce_value("42", "number", "x") == 42.0

    def test_rejects_infinity(self):
        with pytest.raises(ValueError, match="must be a number"):
            _coerce_value("Infinity", "number", "x")

    def test_rejects_nan(self):
        with pytest.raises(ValueError, match="must be a number"):
            _coerce_value("NaN", "number", "x")


class TestCoerceBoolean:
    def test_parses_true_false(self):
        assert _coerce_value("true", "boolean", "x") is True
        assert _coerce_value("false", "boolean", "x") is False

    def test_rejects_other_values(self):
        with pytest.raises(ValueError, match="must be true or false"):
            _coerce_value("yes", "boolean", "x")
        with pytest.raises(ValueError, match="must be true or false"):
            _coerce_value("1", "boolean", "x")


class TestCoerceString:
    def test_returns_raw_string(self):
        assert _coerce_value("hello", "string", "x") == "hello"
        assert _coerce_value("active", "enum", "x") == "active"
        assert _coerce_value("42", "string", "x") == "42"
