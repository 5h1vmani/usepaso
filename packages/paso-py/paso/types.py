from dataclasses import dataclass, field
from typing import Optional, Any, Dict, List


@dataclass
class PasoAuth:
    type: str
    header: Optional[str] = None
    prefix: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> Optional['PasoAuth']:
        if data is None:
            return None
        return cls(
            type=data.get('type'),
            header=data.get('header'),
            prefix=data.get('prefix')
        )


@dataclass
class PasoService:
    name: str
    description: str
    base_url: str
    version: Optional[str] = None
    auth: Optional[PasoAuth] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PasoService':
        return cls(
            name=data.get('name'),
            description=data.get('description'),
            base_url=data.get('base_url'),
            version=data.get('version'),
            auth=PasoAuth.from_dict(data.get('auth'))
        )


@dataclass
class PasoInput:
    type: str
    description: str
    required: Optional[bool] = None
    values: Optional[List[Any]] = None
    default: Optional[Any] = None
    in_: Optional[str] = field(default=None, metadata={'name': 'in'})

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PasoInput':
        return cls(
            type=data.get('type'),
            description=data.get('description'),
            required=data.get('required'),
            values=data.get('values'),
            default=data.get('default'),
            in_=data.get('in')
        )


@dataclass
class PasoOutput:
    type: str
    description: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PasoOutput':
        return cls(
            type=data.get('type'),
            description=data.get('description')
        )


@dataclass
class PasoConstraint:
    max_per_hour: Optional[int] = None
    max_per_request: Optional[int] = None
    max_value: Optional[int] = None
    allowed_values: Optional[List[Any]] = None
    requires_field: Optional[str] = None
    description: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PasoConstraint':
        return cls(
            max_per_hour=data.get('max_per_hour'),
            max_per_request=data.get('max_per_request'),
            max_value=data.get('max_value'),
            allowed_values=data.get('allowed_values'),
            requires_field=data.get('requires_field'),
            description=data.get('description')
        )


@dataclass
class PasoCapability:
    name: str
    description: str
    method: str
    path: str
    permission: str
    consent_required: Optional[bool] = None
    inputs: Optional[Dict[str, PasoInput]] = None
    output: Optional[Dict[str, PasoOutput]] = None
    constraints: Optional[List[PasoConstraint]] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PasoCapability':
        inputs = None
        if data.get('inputs'):
            inputs = {
                name: PasoInput.from_dict(inp)
                for name, inp in data['inputs'].items()
            }

        output = None
        if data.get('output'):
            output = {
                name: PasoOutput.from_dict(out)
                for name, out in data['output'].items()
            }

        constraints = None
        if data.get('constraints'):
            constraints = [
                PasoConstraint.from_dict(c)
                for c in data['constraints']
            ]

        return cls(
            name=data.get('name'),
            description=data.get('description'),
            method=data.get('method'),
            path=data.get('path'),
            permission=data.get('permission'),
            consent_required=data.get('consent_required'),
            inputs=inputs,
            output=output,
            constraints=constraints
        )


@dataclass
class PasoPermissions:
    read: Optional[List[str]] = None
    write: Optional[List[str]] = None
    admin: Optional[List[str]] = None
    forbidden: Optional[List[str]] = None

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> Optional['PasoPermissions']:
        if data is None:
            return None
        return cls(
            read=data.get('read'),
            write=data.get('write'),
            admin=data.get('admin'),
            forbidden=data.get('forbidden')
        )


@dataclass
class PasoDeclaration:
    version: str
    service: PasoService
    capabilities: List[PasoCapability]
    permissions: Optional[PasoPermissions] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PasoDeclaration':
        service = PasoService.from_dict(data.get('service', {}))
        capabilities = [
            PasoCapability.from_dict(cap)
            for cap in data.get('capabilities', [])
        ]
        permissions = PasoPermissions.from_dict(data.get('permissions'))

        return cls(
            version=data.get('version'),
            service=service,
            capabilities=capabilities,
            permissions=permissions
        )


@dataclass
class ValidationError:
    path: str
    message: str
