"""Data shapes for the Differentiated Homework module."""
from datetime import datetime
from typing import Annotated, Dict, List, Literal, Optional

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool, StrictInt, model_validator

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


# --- Question Selection ---------------------------------------------------------


class CandidateQuestion(BaseModel):
    """A question bank item as seen by the selector. Answers and rubrics are never included."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1)
    school_id: str
    subject_id: str
    text: str
    type: str
    marks: StrictInt  # range is checked by the selector, so bad values are reported, not rejected
    competency: str  # raw stored value; free text in the database
    bloom_level: str
    is_ai_generated: bool


class QuestionBankLoad(BaseModel):
    """Questions read from the database, plus the IDs of rows that couldn't be read."""

    model_config = ConfigDict(frozen=True)

    candidates: List[CandidateQuestion]
    malformed_question_ids: List[str]  # skipped because stored values have the wrong type


class SelectionRequest(BaseModel):
    """What the caller wants. Sizes come from the caller; there are no built-in defaults."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    school_id: str = Field(min_length=1)
    subject_id: str = Field(min_length=1)
    max_questions: StrictInt = Field(ge=1)
    max_total_marks: Optional[StrictInt] = Field(default=None, ge=1)
    # Required: AI-generated questions have no review status, so the caller must decide.
    include_ai_generated: bool


class SelectedQuestion(BaseModel):
    model_config = ConfigDict(frozen=True)

    question_id: str
    competency: Competency
    competency_rank: int  # rank of this competency in the gap analysis (1 = weakest)
    marks: int
    type: str
    bloom_level: str
    is_ai_generated: bool
    text: str


class SelectionResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    student_id: str
    selected: List[SelectedQuestion]  # in selection order
    total_marks: int
    requested_questions: int
    max_total_marks: Optional[int]
    shortfall: int  # requested_questions minus the number selected
    priority: List[List[Competency]]  # competency groups, weakest first; tied competencies share a group
    eligible_by_competency: Dict[Competency, int]  # passed all filters, before the marks limit
    excluded: Dict[str, int]  # reason -> count
    notes: List[str]


# --- Homework Assembly ----------------------------------------------------------


class DraftItem(BaseModel):
    """One question in a homework draft. Answers, rubrics and options are never included."""

    model_config = ConfigDict(frozen=True)

    position: int  # 1-based, in selection order
    question_id: str
    competency: Competency
    competency_rank: int
    marks: int
    type: str
    bloom_level: str
    is_ai_generated: bool
    text: str


class DraftRationale(BaseModel):
    """Why this homework was assembled, taken directly from the gap analysis. No interpretation."""

    model_config = ConfigDict(frozen=True)

    targeted_competencies: List[Competency]  # in order of first appearance in the selection
    weakest: List[Competency]
    competency_scores: Dict[Competency, int]
    lowest_score: int
    highest_score: int
    score_source: str
    summary: str


class HomeworkDraft(BaseModel):
    """An unsaved homework draft for teacher review. Not an assignment; nothing is stored."""

    model_config = ConfigDict(frozen=True)

    student_id: str
    school_id: str
    subject_id: str
    items: List[DraftItem]
    question_count: int
    total_marks: int
    requested_questions: int
    max_total_marks: Optional[int]
    shortfall: int
    is_complete: bool  # True when every requested question was found
    contains_ai_generated: bool
    rationale: DraftRationale
    notes: List[str]  # gap-analysis notes, then selection notes, then assembly notes


class HomeworkPreviewRequest(BaseModel):
    """Body of POST /students/{student_id}/homework/preview.

    No school_id: the school comes from the student's record on the server. Unknown fields
    are rejected, so a client can't supply one.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    subject_id: str = Field(min_length=1)
    max_questions: StrictInt = Field(ge=1)
    max_total_marks: Optional[StrictInt] = Field(default=None, ge=1)
    include_ai_generated: StrictBool  # required and must be a real true/false


# --- Saved homework drafts ------------------------------------------------------------

DraftStatus = Literal["draft", "approved", "rejected", "assigned"]


class QuestionSnapshot(BaseModel):
    """Full copy of a question bank item for saving. INTERNAL: includes the answer key and
    rubric, so it must never be used as an API response model."""

    model_config = ConfigDict(frozen=True)

    id: str
    text: str
    type: str
    options_json: List[object]
    marks: StrictInt
    competency: str
    bloom_level: str
    is_ai_generated: bool
    correct_answer: Optional[str] = None
    marking_rubric: Optional[str] = None


class HomeworkDraftSaveRequest(HomeworkPreviewRequest):
    """Same settings as the preview. The server regenerates the draft and saves that.

    expected_question_ids: optional. If given, the save is refused (409) unless the regenerated
    draft has exactly these questions in this order, so the teacher saves what they previewed.
    """

    expected_question_ids: Optional[List[str]] = None


class DraftReviewRequest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    note: Optional[str] = Field(default=None, max_length=2000)


class SavedDraftItemOut(BaseModel):
    """A saved question as shown to teachers. No answer key or rubric."""

    model_config = ConfigDict(frozen=True)

    position: int
    source_question_id: str
    text: str
    type: str
    options: List[object]
    marks: int
    competency: Competency
    competency_rank: int
    bloom_level: str
    is_ai_generated: bool


class SavedDraftSummaryOut(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    student_id: str
    school_id: str
    subject_id: str
    status: DraftStatus
    created_by: str
    question_count: int
    total_marks: int
    created_at: datetime
    updated_at: datetime


class SavedDraftOut(SavedDraftSummaryOut):
    requested_questions: int
    max_total_marks: Optional[int]
    include_ai_generated: bool
    shortfall: int
    is_complete: bool
    rationale: DraftRationale
    notes: List[str]
    reviewed_by: Optional[str]
    reviewed_at: Optional[datetime]
    review_note: Optional[str]
    items: List[SavedDraftItemOut]


# --- Homework assignments ------------------------------------------------------------

AssignmentStatus = Literal["assigned"]


class AssignRequest(BaseModel):
    """Body of POST /homework/drafts/{draft_id}/assign. Student, school and teacher come from
    the draft and the logged-in user, never from the client."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    due_at: Optional[AwareDatetime] = None  # must include a time zone; checked to be in the future


class AssignmentSummaryOut(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    draft_id: str
    student_id: str
    school_id: str
    subject_id: str
    status: AssignmentStatus
    assigned_by: str
    assigned_at: datetime
    due_at: Optional[datetime]
    question_count: int
    total_marks: int


class AssignmentOut(AssignmentSummaryOut):
    items: List[SavedDraftItemOut]  # the draft's frozen snapshots; no answer key or rubric
