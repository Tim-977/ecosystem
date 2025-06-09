from django import template

register = template.Library()

@register.filter(name='add_class')
def add_class(field, css):
    existing = field.field.widget.attrs.get('class', '')
    if existing:
        css = existing + ' ' + css
    return field.as_widget(attrs={**field.field.widget.attrs, 'class': css})
