"""Every API error has one shape:

    {"error": {"code": "invalid", "message": "Readable sentence.", "fields": {"name": ["..."]}}}

`message` is always safe to show to the person using the app; `fields` maps
request fields to their problems (empty when the error isn't about a field).
"""
import logging

from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from mainpage.services import ServiceError

logger = logging.getLogger('api')


def error_response(status, code, message, fields=None):
    return Response({'error': {'code': code, 'message': message, 'fields': fields or {}}}, status=status)


def _messages(value):
    if isinstance(value, dict):
        return [m for v in value.values() for m in _messages(v)]
    if isinstance(value, (list, tuple)):
        return [m for v in value for m in _messages(v)]
    return [str(value)]


def _fields(data):
    if isinstance(data, dict):
        return {key: _messages(value) for key, value in data.items()}
    return {'non_field_errors': _messages(data)}


def handler(exc, context):
    if isinstance(exc, ServiceError):
        return error_response(
            exc.status,
            'not_found' if exc.status == 404 else 'invalid',
            exc.message,
            {exc.field: [exc.message]} if exc.field else {},
        )

    response = drf_exception_handler(exc, context)
    if response is None:
        # Log the failure without the request body (it may hold passwords or
        # journal text); the client only learns that something went wrong.
        view = context.get('view')
        logger.error('Unhandled error in %s', type(view).__name__ if view else 'API', exc_info=exc)
        return error_response(500, 'server_error', 'Something went wrong on the server. Please try again.')

    if isinstance(exc, exceptions.ValidationError):
        fields = _fields(response.data)
        messages = [m for ms in fields.values() for m in ms]
        message = messages[0] if messages else 'Check the highlighted fields.'
        if 'non_field_errors' in fields and len(fields) == 1:
            fields = {}
        response.data = {'error': {'code': 'invalid', 'message': message, 'fields': fields}}
        return response

    data = response.data
    detail = data.get('detail', data) if isinstance(data, dict) else data
    code = getattr(exc, 'default_code', 'error')
    if isinstance(exc, exceptions.Throttled):
        message = 'Too many requests. Please wait a moment and try again.'
    elif isinstance(exc, exceptions.NotAuthenticated):
        message = 'Sign in to continue.'
    else:
        message = str(detail)
    response.data = {'error': {'code': code, 'message': message, 'fields': {}}}
    return response
