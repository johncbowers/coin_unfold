# References

This note collects references for the inversive-distance formulas used by the project, especially the formulas implemented in [src/domain/analysis/inversiveDistanceAnalysis.ts](../src/domain/analysis/inversiveDistanceAnalysis.ts).

## Inversive distance formulas used here

For two Euclidean circles with center distance $d$ and radii $r_1, r_2$, the implementation uses

$$
I_{\mathrm{plane}} = \frac{d^2 - r_1^2 - r_2^2}{2 r_1 r_2}.
$$

For two spherical circles with spherical center distance $\theta$ and spherical radii $\rho_1, \rho_2$, the implementation uses

$$
I_{\mathrm{sphere}} = \frac{\cos(\rho_1)\cos(\rho_2) - \cos(\theta)}{\sin(\rho_1)\sin(\rho_2)}.
$$

The code computes $\cos(\theta)$ from the dot product of unit pole vectors on the midsphere.

## Bibliography

1. **Ren Guo**. “Local rigidity of inversive distance circle packing.” *Transactions of the American Mathematical Society* **363**(9), 4757–4776, 2011.
   - A standard modern reference for Euclidean inversive-distance circle packings and the usual planar inversive-distance formula.

2. **Jiming Ma and Jean-Marc Schlenker**. “Non-rigidity of Spherical Inversive Distance Circle Packings.” *Discrete & Computational Geometry* **47**(3), 610–617, 2012.
   - A standard reference for inversive distance in the spherical circle-packing setting.

3. **Kenneth Stephenson**. *Introduction to Circle Packing: The Theory of Discrete Analytic Functions*. Cambridge University Press, 2005.
   - Background reference for circle packing and the geometric conventions used around disks, tangencies, and Möbius/inversive viewpoints.

4. **Alan F. Beardon**. *The Geometry of Discrete Groups*. Springer, Graduate Texts in Mathematics 91, 1983.
   - Classical background reference for Möbius and inversive geometry.

5. **Alan F. Beardon and David Minda**. “Sphere-preserving maps in inversive geometry.” *Proceedings of the American Mathematical Society* **130**(4), 987–998, 2002.
   - Concise reference for sphere-preserving Möbius maps and inversive-geometric background.

6. **John Bowers, Philip L. Bowers, and Kevin Pratt**. “Rigidity of circle polyhedra in the 2-sphere and of hyperideal polyhedra in hyperbolic 3-space.” *Transactions of the American Mathematical Society* **371**(6), 4215–4249, 2019.
   - Useful for the sphere-side circle-polyhedron viewpoint that is closely related to midscribed polyhedra.

## Practical citation guidance

- For the planar formula, cite **Guo (2011)**.
- For the spherical formula, cite **Ma–Schlenker (2012)**.
- For broader geometric background, cite **Stephenson (2005)** and/or **Beardon (1983)**.
