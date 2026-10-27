def init_app():
    from .authentication import routes  # noqa: F401
    from .onboarding import routes      # noqa: F401
    from .loans import routes           # noqa: F401
    from .security import routes        # noqa: F401
    from .cards import routes           # noqa: F401
    from .payments import routes        # noqa: F401
    from .scan import routes            # noqa: F401
