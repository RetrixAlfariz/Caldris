from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

from sympy import Eq, Symbol, factor, simplify, solve
from sympy.core.expr import Expr
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)
FUNCTION_NAMES = {
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "sqrt",
    "log",
    "ln",
    "exp",
    "abs",
}
LATEX_HINT = re.compile(r"\\[A-Za-z]+|\^\{")


@dataclass(slots=True)
class SolveResult:
    original: str
    normalized: str
    kind: str
    variables: list[str]
    solutions: list[str]
    steps: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _symbol_locals(text: str) -> dict[str, Symbol]:
    """Keep engineering-style single-letter symbols such as I as variables."""
    locals_: dict[str, Symbol] = {}
    for name in re.findall(r"[A-Za-z](?:_[A-Za-z0-9]+)?", text):
        if name not in FUNCTION_NAMES:
            locals_[name] = Symbol(name)
    return locals_


def _latexish_to_ascii(text: str) -> str:
    """Small fallback normalizer for common OCR LaTeX forms."""
    value = text
    value = value.replace(r"\left", "").replace(r"\right", "")
    value = value.replace(r"\cdot", "*").replace(r"\times", "*")
    value = value.replace(r"\div", "/")
    value = value.replace(r"\,", " ").replace(r"\!", "")
    value = re.sub(r"\\frac\{([^{}]+)\}\{([^{}]+)\}", r"(\1)/(\2)", value)
    value = re.sub(r"\^\{([^{}]+)\}", r"^(\1)", value)
    value = value.replace("{", "(").replace("}", ")")
    return value


def parse_math(text: str) -> Expr:
    cleaned = text.strip().replace("−", "-").replace("×", "*").replace("÷", "/")
    if not cleaned:
        raise ValueError("Expression is empty.")

    if LATEX_HINT.search(cleaned):
        try:
            from sympy.parsing.latex import parse_latex

            return parse_latex(cleaned)
        except Exception:
            cleaned = _latexish_to_ascii(cleaned)

    return parse_expr(
        cleaned,
        local_dict=_symbol_locals(cleaned),
        transformations=TRANSFORMATIONS,
        evaluate=False,
    )


def parse_equation(text: str) -> tuple[Expr, Expr] | tuple[Expr, None]:
    raw = text.strip()
    if raw.count("=") == 1:
        left, right = raw.split("=", 1)
        return parse_math(left), parse_math(right)
    if "=" in raw:
        raise ValueError("Prototype currently accepts one '=' per expression.")
    return parse_math(raw), None


def _append_unique(steps: list[str], step: str) -> None:
    if not steps or steps[-1] != step:
        steps.append(step)


def _derivation_steps(
    original: str,
    lhs: Expr,
    rhs: Expr,
    variable: Symbol,
    roots: list[Expr],
) -> list[str]:
    steps = [original]
    difference = simplify(lhs - rhs)
    poly = difference.as_poly(variable)

    if poly is not None and poly.degree() == 1:
        coefficient = simplify(poly.coeff_monomial(variable))
        constant = simplify(poly.coeff_monomial(1))
        target = simplify(-constant)

        _append_unique(steps, f"{simplify(coefficient * variable)} = {target}")
        if coefficient != 1:
            _append_unique(steps, f"{variable} = {simplify(target / coefficient)}")
        return steps

    if poly is not None and poly.degree() == 2:
        factored = factor(difference)
        if factored != difference:
            _append_unique(steps, f"{factored} = 0")
        if roots:
            _append_unique(
                steps,
                f"{variable} = " + " or ".join(str(root) for root in roots),
            )
        return steps

    if roots:
        _append_unique(
            steps,
            f"{variable} = " + " or ".join(str(root) for root in roots),
        )
    return steps


def solve_expression(expression: str) -> SolveResult:
    lhs, rhs = parse_equation(expression)

    if rhs is None:
        value = simplify(lhs)
        rendered = str(value)
        return SolveResult(
            original=expression,
            normalized=str(lhs),
            kind="expression",
            variables=sorted(str(symbol) for symbol in lhs.free_symbols),
            solutions=[rendered],
            steps=[expression, rendered]
            if rendered != expression.strip()
            else [expression],
        )

    equation = Eq(lhs, rhs)
    variables = sorted((lhs - rhs).free_symbols, key=lambda symbol: str(symbol))
    normalized = str(equation)

    if not variables:
        truth = bool(simplify(lhs - rhs) == 0)
        return SolveResult(
            original=expression,
            normalized=normalized,
            kind="identity" if truth else "contradiction",
            variables=[],
            solutions=[str(truth)],
            steps=[expression, str(truth)],
        )

    if len(variables) == 1:
        variable = variables[0]
        roots = list(solve(equation, variable))
        return SolveResult(
            original=expression,
            normalized=normalized,
            kind="equation",
            variables=[str(variable)],
            solutions=[str(root) for root in roots],
            steps=_derivation_steps(expression, lhs, rhs, variable, roots),
        )

    solutions = solve(equation, variables, dict=True)
    rendered = [
        ", ".join(f"{key} = {value}" for key, value in solution.items())
        for solution in solutions
    ]
    return SolveResult(
        original=expression,
        normalized=normalized,
        kind="multi-variable-equation",
        variables=[str(symbol) for symbol in variables],
        solutions=rendered,
        steps=[expression] + rendered,
    )
