import os
import subprocess
from pathlib import Path


def load_env_file(yaml_path: str, env_file_path: str = None) -> bool:
    """Load variables from a .env file into os.environ.

    If env_file_path is provided, loads from that path.
    Otherwise loads .env relative to yaml_path.
    Does NOT override existing environment variables.
    Returns True if a .env file was found and loaded.
    """
    env_path = Path(env_file_path) if env_file_path else Path(yaml_path).parent / '.env'
    if not env_path.exists():
        return False

    content = env_path.read_text(encoding='utf-8')
    for line in content.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith('#'):
            continue
        eq_index = trimmed.find('=')
        if eq_index == -1:
            continue
        key = trimmed[:eq_index].strip()
        value = trimmed[eq_index + 1:].strip()
        # Strip surrounding quotes
        if (value.startswith('"') and value.endswith('"')) or \
           (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        # Do not override existing env vars
        if key not in os.environ:
            os.environ[key] = value
    return True


def is_env_tracked_by_git(directory: str) -> bool:
    """Check if .env is tracked by git in the given directory.

    Returns True if tracked (bad), False if untracked or not a git repo.
    """
    try:
        result = subprocess.run(
            ['git', 'ls-files', '.env'],
            cwd=directory,
            capture_output=True,
            text=True,
        )
        return len(result.stdout.strip()) > 0
    except Exception:
        return False


def ensure_gitignore(directory: str) -> None:
    """Ensure .env is listed in .gitignore. Creates .gitignore if it doesn't exist."""
    gitignore_path = Path(directory) / '.gitignore'
    if gitignore_path.exists():
        content = gitignore_path.read_text(encoding='utf-8')
        if any(line.strip() == '.env' for line in content.splitlines()):
            return
        with open(gitignore_path, 'a', encoding='utf-8') as f:
            f.write('\n.env\n')
    else:
        gitignore_path.write_text('.env\n', encoding='utf-8')
