from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from backend.app.schemas.common import BaseSchema


class KnowledgeComponentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    subject_id: str = Field(min_length=1, max_length=64)
    topic: str = Field(min_length=1, max_length=200)


class KnowledgeComponentOut(BaseSchema):
    id: str
    name: str
    description: str
    subject_id: str
    subject_name: str
    topic: str


class RelationshipCreate(BaseModel):
    source_id: str = Field(min_length=1, max_length=64)
    target_id: str = Field(min_length=1, max_length=64)
    relationship: Literal["PREREQUISITE_OF", "RELATED_TO", "PART_OF"]


class RelationshipOut(BaseSchema):
    id: str
    source_id: str
    target_id: str
    relationship: str


class DimensionScores(BaseSchema):
    LU: Optional[float] = None
    CU: Optional[float] = None
    CT: Optional[float] = None
    AU: Optional[float] = None


class AttemptHistoryItem(BaseSchema):
    assessed_at: datetime
    question_id: str
    competency: Literal["LU", "CU", "CT", "AU"]
    score: float
    awarded_marks: float
    max_marks: float
    correct: bool


class ConceptRef(BaseSchema):
    id: str
    name: str
    relationship: str
    overall_mastery: Optional[float] = None
    learning_status: str


class KnowledgeGraphNode(BaseSchema):
    id: str
    name: str
    description: str
    subject: str
    topic: str
    overall_mastery: Optional[float] = None
    lu: Optional[float] = None
    cu: Optional[float] = None
    ct: Optional[float] = None
    au: Optional[float] = None
    attempt_count: int = 0
    correct_count: int = 0
    incorrect_count: int = 0
    learning_status: str
    last_assessed_at: Optional[datetime] = None
    latest: DimensionScores
    previous: DimensionScores
    history: list[AttemptHistoryItem]
    prerequisites: list[ConceptRef]
    related: list[ConceptRef]
    recommendations: list[str]


class KnowledgeGraphEdge(BaseSchema):
    source_id: str
    target_id: str
    relationship: str


class KnowledgeGraphOut(BaseSchema):
    nodes: list[KnowledgeGraphNode]
    edges: list[KnowledgeGraphEdge]
    insights: list[str]


class DemoWalkthroughOut(BaseSchema):
    student_name: str
    student_email: str
    subject_name: str
    assessment_id: str
    title: str
    class_name: str
    extracted_text: str
    evaluated: bool
    total_marks_obtained: Optional[float] = None
    max_possible_marks: Optional[float] = None
    percentage: Optional[float] = None
    graph: KnowledgeGraphOut
