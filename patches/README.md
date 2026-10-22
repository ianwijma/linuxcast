# Pinned dependency declaration patches

`@xyflow%2Fsystem@0.0.83.patch` corrects an upstream declaration constraint exposed by TypeScript 6.0.3 with `exactOptionalPropertyTypes: true` and `skipLibCheck: false`.

`InternalNodeBase<NodeType extends NodeBase>` maps over its generic node type with `Omit`. The compiler does not preserve the optional-property constraint through that mapping when checking it against `InternalNodeBase` without a type argument. The patch intersects the already-required `Omit<NodeBase, 'measured'>` constraint explicitly in both published ESM/UMD declarations. It does not change runtime JavaScript or broaden individual optional properties; application strictness remains enabled.

Bun applies this exact-version patch during frozen installs through root `patchedDependencies`; the patch hash is recorded in `bun.lock`. It was prepared with `bun patch` to avoid editing the global cache. Verify with a fresh frozen install and `bun run typecheck` against the actual workflow editor. Review/remove the patch when upgrading the upstream package; do not apply it silently to a different version.

This is a coordinator-owned dependency compatibility fix requested by S0-06. React Flow/System retain their upstream MIT licenses. Canonical locally bundled Inter and JetBrains Mono packages retain OFL-1.1; the spike documents their asset provenance.
