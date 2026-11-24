{
  description = "Ergon CLI development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        # NoCC: on Darwin, mkShell's stdenv exports DEVELOPER_DIR at a Nix Apple
        # SDK whose old xcrun prints "unhandled Platform key FamilyDisplayName"
        # whenever a /usr/bin Xcode shim (git, say) runs. Deno needs no C toolchain.
        devShells.default = pkgs.mkShellNoCC {
          packages = with pkgs; [
            deno
            git
            deadnix
            nixfmt-rfc-style
            oxlint # wrapped with tsgolint, for --type-aware
            statix
          ];
        };
      }
    );
}
