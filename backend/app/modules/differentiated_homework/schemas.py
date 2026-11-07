"""Data shapes for the Differentiated Homework module."""
from typing import Annotated, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

Competency = Literal["LU", "CU", "AU", "CT"]

# Fixed order, used to break ties when displaying a ranking.
COMPETENCIES: tuple = ("LU", "CU", "AU", "CT")

# Strict: rejects floats, strings and booleans instead of silently converting them.
Score = Annotated[StrictInt, Field(ge=0, le=100)]


class CompetencyProfile(BaseModel):
    """A student's competency scores, as provided by a data source."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    student_id: str = Field(min_length=1)
    scores: Dict[Competency, Score]
    baseline: Optional[Dict[Competency, Score]] = None
    source: str = Field(min_length=1)

    @model_validator(mode="after")
    def _requires_all_four(self) -> "CompetencyProfile":
        for name, values in (("scores", self.scores), ("baseline", self.baseline)):
            if values is not None and set(values) != set(COMPETENCIES):
                raise ValueError(f"{name} must contain exactly LU, CU, AU and CT")
        return self


class CompetencyGap(BaseModel):
    """One competency's position in the ranking."""

    model_config = ConfigDict(frozen=True)

    competency: Competency
    score: int
    rank: int  # 1 = lowest score; tied scores share a rank
    baseline: Optional[int] = None
    change_from_baseline: Optional[int] = None


class GapAnalysis(BaseModel):
    """Result of comparing a student's four competency scores with each other."""

    model_config = ConfigDict(frozen=True)

    student_id: str
    ranked: List[CompetencyGap]  # lowest score first
    weakest: List[Competency]  # lowest scorers; empty when all four are equal
    has_single_weakest: bool
    lowest_score: int
    highest_score: int
    spread: int  # highest minus lowest
    source: str
    notes: List[str]
