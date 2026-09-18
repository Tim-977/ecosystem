"""The words mood and productivity are rated with in word mode.

Ratings are stored as 1–10 in both formats; each word maps to one value, and
any stored value reads back as the nearest word.
"""

SCALES = {
    'mood': [(1, 'Terrible'), (3, 'Rough'), (6, 'Okay'), (8, 'Good'), (10, 'Excellent!')],
    'productivity': [(1, 'Stalled'), (3, 'Slow'), (6, 'Steady'), (8, 'Productive'), (10, 'In the zone!')],
}


def nearest_word(kind, value):
    if value is None or value == '':
        return ''
    value = float(value)
    return min(SCALES[kind], key=lambda pair: (abs(pair[0] - value), -pair[0]))[1]
