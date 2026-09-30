"""
app.py  -  SmartHire (Student + Recruiter)
------------------------------------------
Flask serves BOTH the API (/api/...) and the frontend (static/index.html),
so there is only ONE thing to run:

    python app.py

The browser opens by itself. Demo logins:
    Student   : student1@gmail.com / pass123
    Recruiter : hr@technova.com    / pass123
"""

import os
import secrets
import socket
import threading
import webbrowser

from flask import Flask, jsonify, request

import ai
import database as db
import routes

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _secret_key():
    """Keep the same secret between restarts so logins survive a server restart."""
    key = os.environ.get("SMARTHIRE_SECRET")
    if key:
        return key
    path = os.path.join(BASE_DIR, ".secret_key")
    if not os.path.exists(path):
        with open(path, "w") as f:
            f.write(secrets.token_hex(32))
    with open(path) as f:
        return f.read().strip()


def create_app():
    app = Flask(__name__, static_folder=os.path.join(BASE_DIR, "static"), static_url_path="")
    app.config.update(
        SECRET_KEY=_secret_key(),
        MAX_CONTENT_LENGTH=3 * 1024 * 1024,       # uploads up to 3 MB
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_HTTPONLY=True,
        SEND_FILE_MAX_AGE_DEFAULT=0,
    )

    os.makedirs(os.path.join(BASE_DIR, "uploads"), exist_ok=True)
    db.init_db()
    db.seed_demo_data()
    ai.get_model()                                 # load (or train) the AI model once at startup

    app.teardown_appcontext(db.close_db)
    routes.register(app)

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.after_request
    def no_cache_api(resp):
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    def _json_error(message, code):
        return jsonify({"error": message}), code

    @app.errorhandler(404)
    def not_found(_e):
        if request.path.startswith("/api/"):
            return _json_error("That API route does not exist.", 404)
        return app.send_static_file("index.html")

    @app.errorhandler(405)
    def wrong_method(_e):
        return _json_error("Wrong request method.", 405)

    @app.errorhandler(413)
    def too_big(_e):
        return _json_error("File is too large (max 2 MB).", 413)

    @app.errorhandler(500)
    def server_error(_e):
        return _json_error("Something went wrong on the server. Check the terminal for details.", 500)

    return app


app = create_app()


def _free_port(start=5000):
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:      # nothing is listening -> free
                return port
    return start


if __name__ == "__main__":
    port = int(os.environ.get("PORT", _free_port()))
    url = f"http://127.0.0.1:{port}"
    print("\n" + "=" * 62)
    print("  SmartHire is running")
    print(f"  Open in browser : {url}   (opening automatically...)")
    print("  Student login   : student1@gmail.com / pass123")
    print("  Recruiter login : hr@technova.com    / pass123")
    print("  Stop the server : press Ctrl + C")
    print("  NOTE: type the link in the BROWSER, never in this terminal.")
    print("=" * 62 + "\n")
    if os.environ.get("SMARTHIRE_NO_BROWSER") != "1":
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("SMARTHIRE_DEBUG") == "1")