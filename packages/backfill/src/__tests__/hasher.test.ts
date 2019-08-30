import * as path from "path";
import * as shelljs from "shelljs";

import { Hasher, createHash } from "../hasher";
import { DependencyResolver } from "../dependencyResolver";
import { createDefaultConfig } from "../config";
import { setupFixture } from "backfill-utils-test";

const config = createDefaultConfig();

const createPackageHasher = async (
  fixtureName: string,
  buildCommand: string
) => {
  // Set up
  const packageRoot = await setupFixture(fixtureName);
  const { hashFileFolder, watchGlobs } = config;

  // Arrange
  const dependencyResolver = new DependencyResolver({ packageRoot });

  const hasher = new Hasher(
    {
      packageRoot,
      hashFileFolder,
      useTelemetry: false,
      watchGlobs
    },
    buildCommand,
    dependencyResolver
  );

  return hasher;
};

describe("createPackageHash()", () => {
  const createPackageHash = async (
    fixtureName: string,
    buildCommand: string
  ) => {
    const hasher = await createPackageHasher(fixtureName, buildCommand);
    const hash = await hasher.createPackageHash();

    return hash;
  };

  describe("Scenario: standalone package with no lock-file", () => {
    const fixtureName = "no-dependency";
    const buildCommand = "backfill -- yarn compile";

    it("creates the same hash twice on the same content", async () => {
      const hashFromOne = await createPackageHash(fixtureName, buildCommand);
      const hashFromTwo = await createPackageHash(fixtureName, buildCommand);

      expect(hashFromOne).toBe(hashFromTwo);
    });

    it("does not create the same hash if build command changes", async () => {
      const hashFromOne = await createPackageHash(fixtureName, buildCommand);
      const hashFromTwo = await createPackageHash(fixtureName, "foo");

      expect(hashFromOne).not.toBe(hashFromTwo);
    });
  });

  describe("Scenario: package with one dependency and no lock-file", () => {
    const fixtureName = "basic";
    const buildCommand = "backfill -- yarn compile";

    it("creates the same hash twice on the same content", async () => {
      const hashFromOne = await createPackageHash(fixtureName, buildCommand);
      const hashFromTwo = await createPackageHash(fixtureName, buildCommand);

      expect(hashFromOne).toBe(hashFromTwo);
    });

    it("does not create the same hash if the dependency changes", async () => {
      const hashFromOne = await createPackageHash(fixtureName, buildCommand);

      const hasherTwo = await createPackageHasher(fixtureName, buildCommand);

      // Change hash of package-2
      shelljs.sed(
        "-i",
        "cf9ea931ea9c06451cb624eb478045bbcd41812c",
        "qwerty",
        path.join(
          process.cwd(),
          "node_modules",
          "package-2",
          "node_modules",
          ".cache",
          "backfill",
          "hash"
        )
      );

      const hashFromTwo = await hasherTwo.createPackageHash();

      expect(hashFromOne).not.toBe(hashFromTwo);
    });
  });

  describe("Scenario: package with one dependency and a lock-file", () => {
    const fixtureName = "basic-with-lock-file";
    const buildCommand = "backfill -- yarn compile";

    it("creates the same hash twice on the same content", async () => {
      const hashFromOne = await createPackageHash(fixtureName, buildCommand);
      const hashFromTwo = await createPackageHash(fixtureName, buildCommand);

      expect(hashFromOne).toBe(hashFromTwo);
    });

    it("does not create the same hash if the lock file changes", async () => {
      const hashFromOne = await createPackageHash(fixtureName, buildCommand);

      const hasherTwo = await createPackageHasher(fixtureName, buildCommand);

      // Change hash of package-2
      shelljs.sed(
        "-i",
        "yarn lockfile v1",
        "yarn lockfile v2",
        path.join(process.cwd(), "yarn.lock")
      );

      const hashFromTwo = await hasherTwo.createPackageHash();

      expect(hashFromOne).not.toBe(hashFromTwo);
    });
  });

  it("does not care about differences in build command when storing the hash value", async () => {
    const fixtureName = "basic";
    const buildCommand = "backfill -- yarn compile";
    const cachePath = (root: string) =>
      path.join(root, "node_modules", ".cache", "backfill", "hash");

    const hashFromOne = await createPackageHash(fixtureName, buildCommand);
    const hashStoredFromOne = shelljs.cat(cachePath(process.cwd())).toString();

    const hashFromTwo = await createPackageHash(fixtureName, "echo foo");
    const hashStoredFromTwo = shelljs.cat(cachePath(process.cwd())).toString();

    // Expect the package hash to be different ..
    expect(hashFromOne).not.toBe(hashFromTwo);

    // .. but expect the stored hash for the package to be the same
    expect(hashStoredFromOne).toBe(hashStoredFromTwo);
  });
});

describe("hashOfDependencies()", () => {
  const getHashOfDependencies = async (fixtureName: string) => {
    const hasher = await createPackageHasher(
      fixtureName,
      "backfill -- yarn compile"
    );

    const dependencyResolver = new DependencyResolver({
      packageRoot: process.cwd()
    });
    const dependencies = dependencyResolver.dependencies();

    const hash = await Promise.all(hasher.getHashOfDependencies(dependencies));

    return hash;
  };

  it("gets hash from a dependency's pre-calculated hash", async () => {
    const hash = await getHashOfDependencies("basic");
    expect(hash).toStrictEqual(["cf9ea931ea9c06451cb624eb478045bbcd41812c"]);
  });

  it("creates hash based a dependency's package.json when a pre-calculated hash does not exist", async () => {
    const hash = await getHashOfDependencies(
      "dependency-has-no-precalculated-hash"
    );

    const correctHash = await createHash("package-2@0.1.0");
    expect(hash).toStrictEqual([correctHash]);
  });

  it("ignores unresolved dependencies", async () => {
    const hash = await getHashOfDependencies("unresolved-dependency");
    expect(hash).toStrictEqual([]);
  });
});