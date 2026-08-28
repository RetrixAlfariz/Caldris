from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from sympy import Symbol, simplify

from caldris.solver import parse_equation


@dataclass(slots=True)
class WorkspaceEntry:
    raw: str
    symbol: str
    expression: str
    value: str
    dependencies: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def evaluate_workspace(lines: list[str]) -> dict[str, Any]:
    definitions: dict[Symbol, object] = {}
    raw_by_symbol: dict[Symbol, str] = {}

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        lhs, rhs = parse_equation(line)
        if rhs is None or not isinstance(lhs, Symbol):
            raise ValueError(
                "Workspace lines must be variable assignments such as 'a = 5': "
                f"{line}"
            )

        definitions[lhs] = rhs
        raw_by_symbol[lhs] = line

    cache: dict[Symbol, object] = {}

    def resolve(symbol: Symbol, stack: tuple[Symbol, ...] = ()):
        if symbol in cache:
            return cache[symbol]
        if symbol in stack:
            chain = " -> ".join(str(item) for item in (*stack, symbol))
            raise ValueError(f"Circular dependency detected: {chain}")

        expression = definitions[symbol]
        substitutions = {}
        for dependency in expression.free_symbols:
            if dependency in definitions:
                substitutions[dependency] = resolve(
                    dependency,
                    (*stack, symbol),
                )

        value = simplify(expression.subs(substitutions))
        cache[symbol] = value
        return value

    entries: list[WorkspaceEntry] = []
    for symbol, expression in definitions.items():
        dependencies = sorted(
            str(dependency)
            for dependency in expression.free_symbols
            if dependency in definitions
        )
        value = resolve(symbol)
        entries.append(
            WorkspaceEntry(
                raw=raw_by_symbol[symbol],
                symbol=str(symbol),
                expression=str(expression),
                value=str(value),
                dependencies=dependencies,
            )
        )

    return {
        "variables": {entry.symbol: entry.value for entry in entries},
        "entries": [entry.to_dict() for entry in entries],
    }
