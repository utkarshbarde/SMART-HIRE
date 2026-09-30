"""Registers all API blueprints on the Flask app."""

from . import auth, student, recruiter


def register(app):
    app.register_blueprint(auth.bp)
    app.register_blueprint(student.bp)
    app.register_blueprint(recruiter.bp)