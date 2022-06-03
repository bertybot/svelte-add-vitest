import { Preset, color } from "apply";

type Dependencies = {
  [key: string]: {
    version: string;
    type?: "DEV" | "PEER";
    reliesOn?: string | string[];
  };
};

type Configuration = {
  [key: string]: {
    message: string;
    default: any;
    question?: true;
  };
};

/**
 * Svelte adder utility class.
 *
 * Used to simplify interaction with Preset and approach
 * file-structure modification in a configuration-based way.
 */
abstract class Adder {
  /**
   * The adder's name, which is displayed as the name
   * of the Preset. Specified on the implementation level.
   *
   * @protected
   */
  protected abstract readonly ADDER_NAME: string;

  /**
   * A dictionary of configuration options. Each option
   * will either be determined interactively; when the
   * `--interaction` flag is present, or through CLI flags.
   *
   * @protected
   */
  protected abstract readonly CONFIGURATION: Configuration;

  /**
   * A dictionary of required dependencies. Each dependency
   * has an associated version, and the type can be either
   * explicitly set as 'DEV' or 'PEER', or implicitly
   * inferred as a core dependency when left `undefined`.
   *
   * Each dependency can also specify whether or not they
   * should be installed based on the presence of a
   * configuration option, defined in `CONFIGURATION`.
   *
   * @protected
   */
  protected abstract readonly REQUIRED_DEPENDENCIES: Dependencies;

  /**
   * Runs an adder. Initialises all configuration and
   * dependencies, followed by running the implementation
   * specific functionality.
   */
  run(): void {
    this.initialiseAdder();
  }

  /**
   * Safely extracts a file, ensuring the user acknowledges
   * that their previously defined data will be overwritten.
   *
   * @param title    The title of the specific action being
   *                 performed.
   * @param filename The filename to move from the templates
   *                 folder.
   * @protected
   */
  protected safeExtract(title: string, filename: string) {
    return Preset.extract(filename).whenConflict("ask").withTitle(title);
  }

  protected getConfiguration<T>(key): T {
    return Preset.isInteractive() ? Preset.prompts[key] : Preset.options[key];
  }

  private initialiseAdder(): void {
    Preset.setName(this.ADDER_NAME);
    this.setupConfiguration();
    this.setupDependencies();
  }

  private setupConfiguration(): void {
    Object.keys(this.CONFIGURATION).forEach((configurationKey) => {
      const configuration = this.CONFIGURATION[configurationKey];

      this.configure(
        configurationKey,
        configuration.message,
        configuration.default,
        configuration.question || false
      );
    });
  }

  private setupDependencies(): void {
    Preset.group((preset) => {
      Object.keys(this.REQUIRED_DEPENDENCIES).forEach((dependencyName) => {
        const dependencyConfig = this.REQUIRED_DEPENDENCIES[dependencyName];

        let action;

        switch (dependencyConfig.type) {
          case "DEV":
            action = preset
              .editNodePackages()
              .addDev(dependencyName, dependencyConfig.version);
            break;
          case "PEER":
            action = preset
              .editNodePackages()
              .addPeer(dependencyName, dependencyConfig.version);
            break;
          case undefined:
            action = preset
              .editNodePackages()
              .add(dependencyName, dependencyConfig.version);
            break;
        }

        action.if(() =>
          dependencyConfig.reliesOn
            ? Array.isArray(dependencyConfig.reliesOn)
              ? dependencyConfig.reliesOn.every(Boolean)
              : this.getConfiguration(dependencyConfig.reliesOn)
            : true
        );
      });
    }).withTitle("Adding required dependencies");
  }

  private configure(
    key: string,
    msg: string,
    init: any,
    confirm: boolean
  ): void {
    Preset.group((preset) => {
      preset.confirm(key, msg, init).if(() => confirm);
      preset.input(key, msg, init).if(() => !confirm);
    })
      .withoutTitle()
      .ifInteractive();

    Preset.group((preset) => preset.option(key, init))
      .withoutTitle()
      .if(() => !Preset.isInteractive());
  }
}

class SvelteVitestAdder extends Adder {
  protected readonly ADDER_NAME = "svelte-add-vitest";

  protected readonly CONFIGURATION: Configuration = {
    jsdom: {
      message: "Enable JSDOM environment by default?",
      default: true,
      question: true,
    },
    "jest-dom": {
      message: "Enable Jest DOM support?",
      default: true,
      question: true,
    },
    examples: {
      message: "Generate example test file?",
      default: true,
      question: true,
    },

  };

  protected readonly REQUIRED_DEPENDENCIES: Dependencies = {
    vite: { version: "^2.9.9", type: "DEV" },
    vitest: { version: "^0.13.1", type: "DEV" },
    "@sveltejs/vite-plugin-svelte": { version: "^1.0.0-next.47", type: "DEV" },
    "@testing-library/svelte": { version: "^3.0.0", type: "DEV" },
    "@testing-library/jest-dom": {
      version: "^5.14.0",
      type: "DEV",
      reliesOn: ["jest-dom", "jsdom"],
    },
    "@types/testing-library__jest-dom": {
      version: "^5.14.0",
      type: "DEV",
      reliesOn: ["jest-dom", "jsdom"],
    },
    jsdom: { version: "^19.0.0", type: "DEV", reliesOn: "jsdom" },
  };

  run(): void {
    super.run();

    this.safeExtract("Initializing Vitest config", "vitest.config.ts");

    Preset.editJson("tsconfig.json")
      .merge({
        compilerOptions: {
          types: ["vitest/globals", "@testing-library/jest-dom"],
        },
      })
      .withTitle("Modifying TypeScript config for project");

    Preset.edit("vitest.config.ts")
      .withTitle("Modifying vitest config to enable JSDOM environment")
      .if(() => this.getConfiguration("jsdom"))
      .addAfter("globals: true", `environment: 'jsdom'`);

    this.safeExtract("Initializing example test file", "index-dom.spec.ts")
      .to("src/routes/")
      .if(
        () =>
          this.getConfiguration("examples") && this.getConfiguration("jest-dom")
      );

    this.safeExtract("Initializing example test file", "index.spec.ts")
      .to("src/routes/")
      .if(
        () =>
          this.getConfiguration("examples") &&
          !this.getConfiguration("jest-dom")
      );

    Preset.editJson("package.json")
      .merge({ scripts: { test: "vitest run", "test:watch": "vitest watch" } })
      .withTitle("Adding test scripts to package.json");

    Preset.instruct(
      `Run ${color.magenta("npm install")}, ${color.magenta(
        "pnpm install"
      )}, or ${color.magenta("yarn")} to install dependencies`
    ).withHeading("What's next?");
  }
}

new SvelteVitestAdder().run();
