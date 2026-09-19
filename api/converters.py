from datetime import date


class IsoDateConverter:
    """YYYY-MM-DD in a URL, as a datetime.date (invalid dates don't match)."""
    regex = r'\d{4}-\d{2}-\d{2}'

    def to_python(self, value):
        return date.fromisoformat(value)

    def to_url(self, value):
        return value.isoformat() if isinstance(value, date) else value
