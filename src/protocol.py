"""
Protocol models and JSON Schema validation for the multi-agent collaboration platform.

This module defines:
    * Enumerations covering the supported payload types and status values.
    * JSON Schema documents for the session envelope and each payload.
    * A ProtocolValidator helper that validates envelopes end-to-end.
    * An Envelope dataclass that provides typed accessors and (de)serialisation helpers.
"""

from __future__ import annotations

import datetime as _dt
import json
from collections.abc import Mapping as _MappingABC
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Mapping, Optional

try:  # pragma: no cover - optional dependency guard
    from jsonschema import Draft202012Validator, FormatChecker
    from jsonschema.exceptions import ValidationError as JSONSchemaValidationError
except ImportError as exc:  # pragma: no cover - bubble up clear guidance
    raise RuntimeError(
        "The 'jsonschema' package is required to use protocol validation utilities. "
        "Install it via `pip install jsonschema`."
    ) from exc


DEFAULT_PROTOCOL_VERSION = "1.0"


class PayloadType(str, Enum):
    CLARIFICATION = "clarification"
    CLARIFICATION_RESPONSE = "clarification_response"
    PLAN = "plan"
    TICKET = "ticket"
    INSTRUCTION_PROPOSAL = "instruction_proposal"
    INSTRUCTION = "instruction"
    REPORT = "report"
    REVIEW = "review"
    ARTIFACT_REF = "artifact_ref"
    OUTLINE_GENERATED = "outline_generated"
    DRAFT_GENERATED = "draft_generated"
    REVIEW_PROVIDED = "review_provided"
    SUMMARY_GENERATED = "summary_generated"
    PLAN_CREATED = "plan_created"
    SUBTASK_RESULT = "subtask_result"
    COORD_DECISION = "coord_decision"
    COORD_RESPONSE = "coord_response"
    USER_COMMAND = "user_command"
    USER_FEEDBACK = "user_feedback"
    ERROR = "error"


class ClarificationStatus(str, Enum):
    OPEN = "open"
    NEEDS_INPUT = "needs_input"
    RESOLVED = "resolved"


class ClarificationResponseStatus(str, Enum):
    OPEN = "open"
    ANSWERED = "answered"
    RESOLVED = "resolved"


class PlanTaskStatus(str, Enum):
    PENDING = "pending"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TicketStatus(str, Enum):
    PENDING = "pending"
    DISCUSSING = "discussing"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    AWAITING_REVIEW = "awaiting_review"
    DONE = "done"
    ERROR = "error"


class InstructionProposalStatus(str, Enum):
    DRAFT = "draft"
    NEEDS_ALIGNMENT = "needs_alignment"
    CONFIRMED = "confirmed"


class ReportStatus(str, Enum):
    PROPOSAL = "proposal"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    PARTIAL = "partial"
    FAILED = "failed"


class ReviewDecision(str, Enum):
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"
    REJECTED = "rejected"


class ErrorCode(str, Enum):
    VALIDATION_FAILED = "validation_failed"
    EXECUTION_ERROR = "execution_error"
    TIMEOUT = "timeout"
    NOT_FOUND = "not_found"
    INTERNAL_ERROR = "internal_error"


def _iso_with_z(dt: datetime) -> str:
    """
    将 datetime 统一编码为 UTC ISO8601 字符串，结尾使用 'Z'。

    规则：
    - 如果 dt 没有 tzinfo（naive），按**已经是 UTC** 处理，并补上 timezone.utc。
      （如果以后想更严格，可以改成直接抛异常。）
    - 如果 dt 有时区信息，则统一转换为 UTC。
    - 最终返回形如 '2025-12-06T12:34:56Z' 的字符串。
    """
    if dt.tzinfo is None:
        # 当前策略：把 naive 当成 UTC。也可以改成直接 raise。
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)

    iso = dt.isoformat()
    # 把 '+00:00' 换成 'Z'
    if iso.endswith("+00:00"):
        iso = iso[:-6] + "Z"
    return iso


def _parse_iso8601(value: str) -> datetime:
    """
    解析协议中的时间戳字符串，返回 UTC 的 datetime（tz-aware）。

    接受的格式：
    - '2025-12-06T12:34:56Z'
    - 或带显式时区偏移的字符串（如 '2025-12-06T20:34:56+08:00'），最终都会转换为 UTC。

    不接受：
    - 没有任何时区信息的字符串（naive datetime），会抛出 ValueError。
    """
    original = value
    try:
        # 如果以 Z 结尾，规范化为 +00:00 再交给 fromisoformat
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"

        dt = datetime.fromisoformat(value)
    except ValueError as e:
        raise ValueError(
            f"Invalid ISO 8601 timestamp (expected UTC 'Z' or offset): {original}"
        ) from e

    if dt.tzinfo is None:
        # 协议层不允许 naive datetime
        raise ValueError(
            f"Naive datetime is not allowed in protocol timestamps: {original}"
        )

    # 统一转为 UTC tz-aware datetime
    return dt.astimezone(timezone.utc)


ENVELOPE_SCHEMA: Dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": [
        "session_id",
        "timestamp",
        "source",
        "target",
        "payload_type",
        "version",
        "payload",
    ],
    "properties": {
        "session_id": {"type": "string", "minLength": 1},
        "timestamp": {"type": "string", "format": "date-time"},
        "source": {"type": "string", "minLength": 1},
        "target": {"type": "string", "minLength": 1},
        "payload_type": {"type": "string", "enum": [pt.value for pt in PayloadType]},
        "version": {"type": "string", "minLength": 1},
        "payload": {"type": "object"},
        "metadata": {"type": "object"},
        "idempotency_key": {"type": "string"},
    },
    PayloadType.ARTIFACT_REF.value: {
        "type": "object",
        "required": ["label", "uri"],
        "properties": {
            "label": {"type": "string", "minLength": 1},
            "uri": {"type": "string", "minLength": 1},
            "digest": {"type": "string"},
            "content_type": {"type": "string"},
            "size_bytes": {"type": "integer", "minimum": 0},
            "description": {"type": "string"},
        },
        "additionalProperties": False,
    },
    "additionalProperties": False,
}


def _artifact_ref_payload_schema() -> Dict[str, Any]:
    """Schema shared by every payload that includes an ArtifactRef payload."""
    return {
        "type": "object",
        "required": ["session_id", "artifact_id", "kind", "path"],
        "properties": {
            "session_id": {"type": "string", "minLength": 1},
            "artifact_id": {"type": "string", "minLength": 1},
            "kind": {"type": "string", "minLength": 1},
            "path": {"type": "string", "minLength": 1},
            "description": {"type": "string"},
        },
        "additionalProperties": False,
    }


PAYLOAD_SCHEMAS: Dict[str, Dict[str, Any]] = {
    PayloadType.CLARIFICATION.value: {
        "type": "object",
        "required": ["questions", "status"],
        "properties": {
            "questions": {
                "type": "array",
                "items": {"type": "string", "minLength": 1},
                "minItems": 1,
            },
            "status": {"type": "string", "enum": [status.value for status in ClarificationStatus]},
            "intent_summary": {"type": "string"},
            "notes": {"type": "string"},
        },
        "additionalProperties": False,
    },
    PayloadType.CLARIFICATION_RESPONSE.value: {
        "type": "object",
        "required": ["answers", "status"],
        "properties": {
            "answers": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
            },
            "status": {"type": "string", "enum": [status.value for status in ClarificationResponseStatus]},
            "notes": {"type": "string"},
        },
        "additionalProperties": False,
    },
    PayloadType.PLAN.value: {
        "type": "object",
        "required": ["tasks"],
        "properties": {
            "tasks": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "required": [
                        "task_id",
                        "description",
                        "status",
                        "expected_outputs",
                        "assigned_to",
                    ],
                    "properties": {
                        "task_id": {"type": "string", "minLength": 1},
                        "description": {"type": "string", "minLength": 1},
                        "dependencies": {
                            "type": "array",
                            "items": {"type": "string"},
                            "default": [],
                        },
                        "expected_outputs": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 1,
                        },
                        "assigned_to": {
                            "type": "object",
                            "required": ["role_id"],
                            "properties": {
                                "role_id": {"type": "string", "minLength": 1},
                                "agent_id": {"type": "string"},
                                "notes": {"type": "string"},
                            },
                            "additionalProperties": False,
                        },
                        "status": {"type": "string", "enum": [status.value for status in PlanTaskStatus]},
                        "metadata": {"type": "object"},
                    },
                    "additionalProperties": False,
                },
            },
            "notes": {"type": "string"},
        },
        "additionalProperties": False,
    },
    PayloadType.TICKET.value: {
        "type": "object",
        "required": ["ticket_id", "task_id", "owner", "status", "history"],
        "properties": {
            "ticket_id": {"type": "string", "minLength": 1},
            "task_id": {"type": "string", "minLength": 1},
            "owner": {
                "type": "object",
                "required": ["role_id"],
                "properties": {
                    "role_id": {"type": "string", "minLength": 1},
                    "agent_id": {"type": "string"},
                },
                "additionalProperties": False,
            },
            "status": {"type": "string", "enum": [status.value for status in TicketStatus]},
            "history": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["timestamp", "actor", "event"],
                    "properties": {
                        "timestamp": {"type": "string", "format": "date-time"},
                        "actor": {"type": "string"},
                        "event": {"type": "string"},
                        "payload_type": {"type": "string"},
                        "payload": {"type": "object"},
                        "notes": {"type": "string"},
                    },
                    "additionalProperties": False,
                },
                "default": [],
            },
            "metadata": {"type": "object"},
        },
        "additionalProperties": False,
    },
    PayloadType.INSTRUCTION_PROPOSAL.value: {
        "type": "object",
        "required": ["summary"],
        "properties": {
            "summary": {"type": "string", "minLength": 1},
            "status": {"type": "string", "enum": [status.value for status in InstructionProposalStatus]},
            "open_questions": {
                "type": "array",
                "items": {"type": "string"},
                "default": [],
            },
            "risks": {"type": "array", "items": {"type": "string"}},
            "draft_steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["description"],
                    "properties": {
                        "description": {"type": "string"},
                        "assumptions": {"type": "string"},
                        "tools": {"type": "array", "items": {"type": "string"}},
                    },
                    "additionalProperties": False,
                },
            },
            "notes": {"type": "string"},
        },
        "additionalProperties": False,
    },
    PayloadType.INSTRUCTION.value: {
        "type": "object",
        "required": ["summary", "steps", "acceptance_criteria"],
        "properties": {
            "summary": {"type": "string", "minLength": 1},
            "steps": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "required": ["id", "description"],
                    "properties": {
                        "id": {"type": "string", "minLength": 1},
                        "description": {"type": "string", "minLength": 1},
                        "inputs": {"type": "array", "items": {"type": "string"}},
                        "tools": {"type": "array", "items": {"type": "string"}},
                        "outputs": {"type": "array", "items": {"type": "string"}},
                    },
                    "additionalProperties": False,
                },
            },
            "resources": {
                "type": "array",
                "items": {"type": "string"},
                "default": [],
            },
            "acceptance_criteria": {
                "type": "array",
                "minItems": 1,
                "items": {"type": "string"},
            },
            "notes": {"type": "string"},
        },
        "additionalProperties": False,
    },
    PayloadType.REPORT.value: {
        "type": "object",
        "required": ["status"],
        "properties": {
            "status": {"type": "string", "enum": [status.value for status in ReportStatus]},
            "outputs": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["label"],
                    "properties": {
                        "label": {"type": "string"},
                        "uri": {"type": "string"},
                        "digest": {"type": "string"},
                        "content_type": {"type": "string"},
                    },
                    "additionalProperties": False,
                },
            },
            "evidence": {"type": "array", "items": {"type": "string"}},
            "issues": {"type": "array", "items": {"type": "string"}},
            "next_actions": {"type": "array", "items": {"type": "string"}},
            "notes": {"type": "string"},
        },
        "additionalProperties": False,
    },
    PayloadType.REVIEW.value: {
        "type": "object",
        "required": ["decision"],
        "properties": {
            "decision": {"type": "string", "enum": [decision.value for decision in ReviewDecision]},
            "notes": {"type": "string"},
            "requested_changes": {"type": "array", "items": {"type": "string"}},
        },
        "additionalProperties": False,
    },
    PayloadType.OUTLINE_GENERATED.value: {
        "type": "object",
        "required": ["topic", "outline_artifact"],
        "properties": {
            "topic": {"type": "string", "minLength": 1},
            "outline_artifact": _artifact_ref_payload_schema(),
            "notes": {"type": "string"},
        },
        "additionalProperties": False,
    },
    PayloadType.DRAFT_GENERATED.value: {
        "type": "object",
        "required": ["outline_artifact", "draft_artifact"],
        "properties": {
            "outline_artifact": _artifact_ref_payload_schema(),
            "draft_artifact": _artifact_ref_payload_schema(),
            "notes": {"type": "string"},
        },
        "additionalProperties": False,
    },
    PayloadType.REVIEW_PROVIDED.value: {
        "type": "object",
        "required": ["draft_artifact", "review_artifact"],
        "properties": {
            "draft_artifact": _artifact_ref_payload_schema(),
            "review_artifact": _artifact_ref_payload_schema(),
            "notes": {"type": "string"},
        },
        "additionalProperties": False,
    },
    PayloadType.SUMMARY_GENERATED.value: {
        "type": "object",
        "required": ["summary_artifact"],
        "properties": {
            "summary_artifact": _artifact_ref_payload_schema(),
            "review_artifact": _artifact_ref_payload_schema(),
            "notes": {"type": "string"},
        },
        "additionalProperties": False,
    },
    PayloadType.PLAN_CREATED.value: {
        "type": "object",
        "properties": {
            "topic": {"type": "string"},
            "outline_artifact": {"type": "object"},
            "plan": {"type": "object"},
            "plan_artifact": {"type": "object"},
        },
        "required": ["topic"],
        "additionalProperties": True,
    },
    PayloadType.SUBTASK_RESULT.value: {
        "type": "object",
        "properties": {
            "subtask_id": {"type": "string"},
            "subtask_title": {"type": "string"},
            "result_artifact": {"type": "object"},
        },
        "required": ["subtask_id", "result_artifact"],
        "additionalProperties": True,
    },
    PayloadType.COORD_DECISION.value: {
        "type": "object",
        "properties": {
            "subtask_id": {"type": "string"},
            "decision": {"type": "string"},
            "reason": {"type": "string"},
        },
        "required": ["subtask_id", "decision"],
        "additionalProperties": True,
    },
    PayloadType.USER_COMMAND.value: {
        "type": "object",
        "properties": {
            "text": {"type": "string"},
            "command": {"type": "string"},
            "payload": {"type": "object"},
        },
        "required": ["text"],
        "additionalProperties": True,
    },
    PayloadType.COORD_RESPONSE.value: {
        "type": "object",
        "properties": {
            "question": {"type": "string"},
            "response": {"type": "string"},
        },
        "required": ["question", "response"],
        "additionalProperties": True,
    },
    PayloadType.USER_FEEDBACK.value: {
        "type": "object",
        "properties": {
            "subtask_id": {"type": "string"},
            "decision": {"type": "string", "enum": ["accept", "redo"]},
            "feedback": {"type": "string"},
        },
        "required": ["subtask_id", "decision", "feedback"],
        "additionalProperties": True,
    },
    PayloadType.ERROR.value: {
        "type": "object",
        "required": ["code", "message"],
        "properties": {
            "code": {"type": "string", "enum": [code.value for code in ErrorCode]},
            "message": {"type": "string"},
            "resolution_hint": {"type": "string"},
            "details": {"type": "object"},
        },
        "additionalProperties": False,
    },
}


class ProtocolValidationError(ValueError):
    """Raised when an envelope or payload fails schema validation."""

    def __init__(self, message: str, errors: Optional[str] = None) -> None:
        super().__init__(message)
        self.errors = errors


@dataclass(frozen=True)
class Envelope:
    session_id: str
    timestamp: _dt.datetime
    source: str
    target: str
    payload_type: PayloadType
    version: str
    payload: Mapping[str, Any]
    metadata: Optional[Mapping[str, Any]] = None
    idempotency_key: Optional[str] = None

    @classmethod
    def from_dict(
        cls,
        data: Mapping[str, Any],
        validator: Optional["ProtocolValidator"] = None,
    ) -> "Envelope":
        protocol_validator = validator or ProtocolValidator()
        validated = protocol_validator.validate_envelope(data)
        payload_type = PayloadType(validated["payload_type"])
        timestamp = _parse_iso8601(validated["timestamp"])
        return cls(
            session_id=validated["session_id"],
            timestamp=timestamp,
            source=validated["source"],
            target=validated["target"],
            payload_type=payload_type,
            version=validated["version"],
            payload=validated["payload"],
            metadata=validated.get("metadata"),
            idempotency_key=validated.get("idempotency_key"),
        )

    def to_dict(self) -> Dict[str, Any]:
        document: Dict[str, Any] = {
            "session_id": self.session_id,
            "timestamp": _iso_with_z(self.timestamp),
            "source": self.source,
            "target": self.target,
            "payload_type": self.payload_type.value,
            "version": self.version,
            "payload": dict(self.payload),
        }
        if self.metadata is not None:
            document["metadata"] = dict(self.metadata)
        if self.idempotency_key is not None:
            document["idempotency_key"] = self.idempotency_key
        return document

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, separators=(",", ":"))


class ProtocolValidator:
    def __init__(
        self,
        payload_schemas: Optional[Mapping[str, Mapping[str, Any]]] = None,
        envelope_schema: Optional[Mapping[str, Any]] = None,
    ) -> None:
        self._payload_schemas = dict(payload_schemas or PAYLOAD_SCHEMAS)
        self._envelope_schema = dict(envelope_schema or ENVELOPE_SCHEMA)
        self._format_checker = FormatChecker()
        self._envelope_validator = Draft202012Validator(
            self._envelope_schema,
            format_checker=self._format_checker,
        )
        self._payload_validators = {
            key: Draft202012Validator(schema, format_checker=self._format_checker)
            for key, schema in self._payload_schemas.items()
        }

    def validate_envelope(self, envelope: Mapping[str, Any]) -> Dict[str, Any]:
        try:
            self._envelope_validator.validate(envelope)
        except JSONSchemaValidationError as exc:
            raise ProtocolValidationError(
                f"Envelope validation failed: {exc.message}", errors=str(exc)
            ) from exc
        payload_type = envelope.get("payload_type")
        if payload_type not in self._payload_schemas:
            raise ProtocolValidationError(f"Unsupported payload_type: {payload_type}")
        payload = envelope.get("payload")
        if not isinstance(payload, _MappingABC):
            raise ProtocolValidationError("Envelope.payload must be a JSON object")
        self.validate_payload(payload_type, payload)
        return dict(envelope)

    def validate_payload(self, payload_type: str, payload: Mapping[str, Any]) -> None:
        validator = self._payload_validators.get(payload_type)
        if validator is None:
            raise ProtocolValidationError(f"No schema registered for payload_type={payload_type}")
        try:
            validator.validate(payload)
        except JSONSchemaValidationError as exc:
            raise ProtocolValidationError(
                f"Payload validation failed for {payload_type}: {exc.message}", errors=str(exc)
            ) from exc

    def register_payload_schema(self, payload_type: str, schema: Mapping[str, Any]) -> None:
        self._payload_schemas[payload_type] = dict(schema)
        self._payload_validators[payload_type] = Draft202012Validator(
            schema, format_checker=self._format_checker
        )


def build_envelope(
    *,
    session_id: str,
    source: str,
    target: str,
    payload_type: PayloadType,
    payload: Mapping[str, Any],
    timestamp: Optional[_dt.datetime] = None,
    version: str = DEFAULT_PROTOCOL_VERSION,
    metadata: Optional[Mapping[str, Any]] = None,
    idempotency_key: Optional[str] = None,
    validator: Optional[ProtocolValidator] = None,
) -> Envelope:
    ts = timestamp or _dt.datetime.now(tz=_dt.timezone.utc)
    document: Dict[str, Any] = {
        "session_id": session_id,
        "timestamp": _iso_with_z(ts),
        "source": source,
        "target": target,
        "payload_type": payload_type.value,
        "version": version,
        "payload": dict(payload),
    }
    if metadata is not None:
        document["metadata"] = dict(metadata)
    if idempotency_key is not None:
        document["idempotency_key"] = idempotency_key
    protocol_validator = validator or ProtocolValidator()
    protocol_validator.validate_envelope(document)
    return Envelope.from_dict(document, validator=protocol_validator)


__all__ = [
    "DEFAULT_PROTOCOL_VERSION",
    "Envelope",
    "PayloadType",
    "ClarificationStatus",
    "ClarificationResponseStatus",
    "PlanTaskStatus",
    "TicketStatus",
    "InstructionProposalStatus",
    "ReportStatus",
    "ReviewDecision",
    "ErrorCode",
    "ENVELOPE_SCHEMA",
    "PAYLOAD_SCHEMAS",
    "ProtocolValidator",
    "ProtocolValidationError",
    "build_envelope",
]
