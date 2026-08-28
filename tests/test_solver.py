from caldris.solver import solve_expression


def test_linear_equation_has_solution_and_steps() -> None:
    result = solve_expression("2x + 4 = 10")

    assert result.variables == ["x"]
    assert result.solutions == ["3"]
    assert result.steps[-1] == "x = 3"


def test_quadratic_equation_solves_both_roots() -> None:
    result = solve_expression("x^2 + 5x + 6 = 0")

    assert set(result.solutions) == {"-3", "-2"}
    assert any("(x + 2)*(x + 3)" in step for step in result.steps)
