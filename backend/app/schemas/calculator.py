"""
Pydantic schemas for calculator formula API endpoints
"""

from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Any
from datetime import datetime

VALID_AST_KINDS = {"literal", "rate_ref", "binary"}


def _validate_ast_node(node: Any, depth: int = 0) -> None:
    """Recursively validate a formula AST node."""
    if depth > 20:
        raise ValueError("AST nesting too deep (max 20)")
    if not isinstance(node, dict):
        raise ValueError("Each AST node must be an object")
    kind = node.get("kind")
    if kind not in VALID_AST_KINDS:
        raise ValueError(f"Invalid AST node kind '{kind}'; expected one of {VALID_AST_KINDS}")
    if kind == "literal":
        if "value" not in node:
            raise ValueError("Literal node must have a 'value' field")
    elif kind == "rate_ref":
        if "competitor" not in node or "symbol" not in node or "rateType" not in node:
            raise ValueError("rate_ref node must have 'competitor', 'symbol', and 'rateType'")
    elif kind == "binary":
        if "op" not in node or "left" not in node or "right" not in node:
            raise ValueError("binary node must have 'op', 'left', and 'right'")
        _validate_ast_node(node["left"], depth + 1)
        _validate_ast_node(node["right"], depth + 1)


class FormulaCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    ast: Any = Field(...)  # Formula AST tree, stored as JSON

    @field_validator("ast")
    @classmethod
    def validate_ast(cls, v: Any) -> Any:
        _validate_ast_node(v)
        return v


class FormulaUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    ast: Optional[Any] = None
    order_index: Optional[int] = None

    @field_validator("ast")
    @classmethod
    def validate_ast(cls, v: Any) -> Any:
        if v is not None:
            _validate_ast_node(v)
        return v


class FormulaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    name: str
    description: Optional[str]
    ast: Any
    order_index: int
    created_at: datetime
    updated_at: datetime
