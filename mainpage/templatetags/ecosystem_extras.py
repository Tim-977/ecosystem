"""
Presentational template helpers for the Ecosystem frontend.

Nothing here reads the database or changes what a view exposes; it only does
calendar arithmetic the template language can't (e.g. "previous month").
"""
import calendar
from datetime import date

from django import template

register = template.Library()


@register.simple_tag
def month_nav(year, month):
    """Neighbouring months for prev/next links, plus whether "next" lies in the future."""
    year, month = int(year), int(month)
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    today = date.today()
    return {
        "year": year,
        "month": month,
        "name": calendar.month_name[month],
        "prev_year": prev_year,
        "prev_month": prev_month,
        "prev_name": calendar.month_name[prev_month],
        "next_year": next_year,
        "next_month": next_month,
        "next_name": calendar.month_name[next_month],
        "next_is_future": (next_year, next_month) > (today.year, today.month),
        "is_current": (year, month) == (today.year, today.month),
    }


@register.filter
def month_name(month):
    try:
        return calendar.month_name[int(month)]
    except (TypeError, ValueError, IndexError):
        return ""
