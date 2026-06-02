"""
Formula CRUD service — pure persistence, no evaluation.
"""

import logging
from datetime import datetime
from typing import List

from sqlalchemy import select, func, and_

from ..database.connection import AsyncSessionLocal
from ..database.models import UserFormula
from ..schemas.calculator import FormulaCreate, FormulaUpdate, FormulaResponse

logger = logging.getLogger(__name__)

FORMULA_LIMIT = 20


class CalculatorService:

    async def get_formulas(self, user_id: str) -> List[FormulaResponse]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(UserFormula)
                .where(UserFormula.user_id == user_id)
                .order_by(UserFormula.order_index.asc(), UserFormula.created_at.asc())
            )
            return [FormulaResponse.model_validate(f) for f in result.scalars().all()]

    async def create_formula(self, user_id: str, data: FormulaCreate) -> FormulaResponse:
        async with AsyncSessionLocal() as session:
            count_result = await session.execute(
                select(func.count(UserFormula.id)).where(UserFormula.user_id == user_id)
            )
            if count_result.scalar_one() >= FORMULA_LIMIT:
                raise ValueError(f"Formula limit of {FORMULA_LIMIT} reached")

            max_idx_result = await session.execute(
                select(func.max(UserFormula.order_index)).where(UserFormula.user_id == user_id)
            )
            next_idx = (max_idx_result.scalar_one() or 0) + 1

            formula = UserFormula(
                user_id=user_id,
                name=data.name,
                description=data.description,
                ast=data.ast,
                order_index=next_idx,
            )
            session.add(formula)
            await session.commit()
            await session.refresh(formula)
            return FormulaResponse.model_validate(formula)

    async def update_formula(self, user_id: str, formula_id: str, data: FormulaUpdate) -> FormulaResponse:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(UserFormula).where(
                    and_(UserFormula.id == formula_id, UserFormula.user_id == user_id)
                )
            )
            formula = result.scalar_one_or_none()
            if not formula:
                raise ValueError("Formula not found")

            if data.name is not None:
                formula.name = data.name
            if data.description is not None:
                formula.description = data.description
            if data.ast is not None:
                formula.ast = data.ast
            if data.order_index is not None:
                formula.order_index = data.order_index
            formula.updated_at = datetime.utcnow()

            await session.commit()
            await session.refresh(formula)
            return FormulaResponse.model_validate(formula)

    async def delete_formula(self, user_id: str, formula_id: str) -> None:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(UserFormula).where(
                    and_(UserFormula.id == formula_id, UserFormula.user_id == user_id)
                )
            )
            formula = result.scalar_one_or_none()
            if not formula:
                raise ValueError("Formula not found")
            await session.delete(formula)
            await session.commit()


calculator_service = CalculatorService()
