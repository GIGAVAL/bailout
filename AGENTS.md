<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Structural analysis lives only in `src/lib/frame.ts` (2D frame, progressive-failure collapse rule); UI never re-implements it — keeps 2D and 3D views consistent.
- `src/components/bailout/Frame3D.tsx` is visualization only, lazy-loaded behind `ClientOnly` so three.js never runs during SSR.
- Terminal keyboard commands map through `src/lib/terminal.ts` into the same game handlers as buttons so keyboard and pointer behavior stay identical.
- Terminal colors and layout live in semantic global CSS tokens; rating band classes share those tokens between quotes, charts, and both structure views.
- Load-path data (signed forces, moment samples, flow segments, reactions, reroute gains) comes from `src/lib/frame.ts`; `LoadPath2D.tsx` and `Frame3D.tsx` only draw it, so 2D and 3D flows match.
