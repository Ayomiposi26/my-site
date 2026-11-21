"""Draw the Challenge 3 investment-game DAG.

The stake fraction is a decision, so it is a rectangle. The coin flip is
chance, and the final balance is the outcome. Run from the project root:

    python3 scripts/draw_simulator_dag.py
"""

import os

import daft

os.makedirs("public/images", exist_ok=True)

BLUE = {"facecolor": "aliceblue"}

pgm = daft.PGM(dpi=160, node_unit=1.6)
pgm.add_node(
    "stake",
    "Stake fraction\n(the decision)",
    0.2,
    1.55,
    scale=1.15,
    aspect=2.15,
    shape="rectangle",
    fontsize=16,
    plot_params=BLUE,
)
pgm.add_node(
    "coin",
    "Coin flip\n(chance)",
    0.2,
    0.05,
    scale=1.15,
    aspect=2.15,
    fontsize=16,
    plot_params=BLUE,
)
pgm.add_node(
    "growth",
    "Yearly growth",
    2.55,
    0.8,
    scale=1.15,
    aspect=2.15,
    fontsize=16,
    plot_params=BLUE,
)
pgm.add_node(
    "wealth",
    "Final balance",
    4.9,
    0.8,
    scale=1.15,
    aspect=2.15,
    fontsize=16,
    plot_params=BLUE,
)

pgm.add_edge("stake", "growth")
pgm.add_edge("coin", "growth")
pgm.add_edge("growth", "wealth")

pgm.render()
pgm.savefig("public/images/dag.png", dpi=200, facecolor="white")
print("saved public/images/dag.png")
