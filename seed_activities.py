import os
import django
import random

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ecosystem.settings")
django.setup()

from mainpage.models import ActivityMapping

USER_ID = 2
YEAR = 2024
MONTH_START = 1
MONTH_END = 12
ACTIVITY_COUNT = 8

assert 1 <= MONTH_START <= 12, "MONTH_START must be in 1..12"
assert 1 <= MONTH_END <= 12, "MONTH_END must be in 1..12"
assert 1 <= ACTIVITY_COUNT <= 10, "ACTIVITY_COUNT must be in 1..10"

COLOR_POOL = [
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#ffff00",
    "#ff00ff",
    "#00ffff",
    "#ffa500",
    "#800080",
    "#00ff7f",
    "#4682b4",
]

NAME_POOL = [
    "Sleeping", "Studying", "Working",
    "Reading", "Gaming", "Coding",
    "Exercising", "Relaxing", "Walking", "Eating"
]

def seed_activity_mapping(user_id, year, month, count):
    ActivityMapping.objects.filter(user_id=user_id, year=year, month=month).delete()

    used = set()
    for i in range(count):
        name = NAME_POOL[i % len(NAME_POOL)]
        color = COLOR_POOL[i % len(COLOR_POOL)]

        ActivityMapping.objects.create(
            user_id=user_id,
            year=year,
            month=month,
            name=name,
            color=color
        )
        used.add(name)

    print(f"[✓] Seeded {count} activities for {year}-{month:02d} (User {user_id})")


def main():
    for m in range(MONTH_START, MONTH_END + 1):
        seed_activity_mapping(USER_ID, YEAR, m, ACTIVITY_COUNT)

main()
