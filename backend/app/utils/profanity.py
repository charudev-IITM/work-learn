"""Thin wrapper around better-profanity for name/business validation."""

from better_profanity import profanity as _profanity

_profanity.load_censor_words()


def contains_profanity(text: str) -> bool:
    """Returns True if the text contains profanity."""
    return _profanity.contains_profanity(text)
