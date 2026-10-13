# Runs the learner's code inside Pyodide. Loaded once by the Python worker.
import sys
import traceback


def run(source, filename):
    """Run one program in a fresh namespace.

    Returns (status, line): status is "ok", "error" or "interrupted"; line is
    the line in the learner's code where the error happened, or None.
    """
    try:
        return _run(source, filename)
    except KeyboardInterrupt:
        # Stop can land anywhere, even while an error is being reported.
        return ("interrupted", None)


def _run(source, filename):
    namespace = {"__name__": "__main__"}
    try:
        code = compile(source, filename, "exec")
        exec(code, namespace)
        return ("ok", None)
    except KeyboardInterrupt:
        # Stop button or time limit. The app writes its own message for these.
        return ("interrupted", None)
    except SystemExit as e:
        if e.code not in (None, 0):
            print(f"Program exited with {e.code!r}", file=sys.stderr)
        return ("ok" if e.code in (None, 0) else "error", None)
    except BaseException as e:
        # Keep only the frames from the learner's file, so the traceback
        # doesn't show the app's own plumbing.
        frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == filename]
        lines = []
        if frames:
            lines.append("Traceback (most recent call last):\n")
            lines.extend(traceback.format_list(frames))
        lines.extend(traceback.format_exception_only(type(e), e))
        sys.stderr.write("".join(lines))
        if isinstance(e, SyntaxError) and e.filename == filename:
            return ("error", e.lineno)
        return ("error", frames[-1].lineno if frames else None)
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
