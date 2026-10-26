"""Load functions from analytics scripts without running the scripts.

The training scripts connect to the warehouse at import time (psycopg2.connect
at module level, no __main__ guard), so importing them from a test would open a
database connection and start a training run. This reads the script's source,
picks out the named top-level function definitions and simple constant
assignments with `ast`, and executes only those. The code under test is the
script's own text, so a change to the script changes what the test runs."""
import ast
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]


def load(rel_path, names, constants=(), namespace=None):
    """Return a dict holding the requested functions and constants of a script."""
    path = SCRIPTS_ROOT / rel_path
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    wanted = set(names) | set(constants)
    found = set()
    body = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in names:
            body.append(node)
            found.add(node.name)
        elif isinstance(node, ast.Assign) and len(node.targets) == 1 \
                and isinstance(node.targets[0], ast.Name) and node.targets[0].id in constants:
            body.append(node)
            found.add(node.targets[0].id)
    missing = wanted - found
    if missing:
        raise LookupError(f"{rel_path} no longer defines {sorted(missing)}")
    ns = dict(namespace or {})
    exec(compile(ast.Module(body=body, type_ignores=[]), str(path), "exec"), ns)
    return ns
