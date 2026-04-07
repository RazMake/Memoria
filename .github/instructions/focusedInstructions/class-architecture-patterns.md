# Class architecture principles

## Obey the following good coding principles
- **Single Responsibility Principle**: each class/method should have one reason to change.
- **Open/Closed Principle**: design for extension, not modification.
- **Liskov Substitution Principle**: derived classes must be substitutable for their base classes.
- **Interface Segregation Principle**: prefer many small interfaces over a few large ones.
- **Dependency Inversion Principle**: depend on abstractions, not concretions.
- **Encapsulate by policy**: Don't default to `public` for both classes and members. Least-exposure rule: `private` > `internal` > `protected` > `public`
- Seal all classes by default; only make them inheritable when encountering the need, even when there is a library class (if you have access to the code of the library)
- Always clean up dead code.
- Reuse existing methods as much as possible.
- Consider coupling and try to aggresively **minimize** it.
- Avoid unnecessary abstractions as much as possible.
- Never add unused parameters to any methods, try to keep things clean by removing unused parameters whenever possible.
- Prefer clear, declarative configuration (JSON/YAML/etc.).
- Use descriptive-but-short names.

## Comments policy
- Comments explain **why**, NOT **what**.
- Add comments for large components to describe their purpose.
- Add comments only where the intent isn't clear from code itself. Avoid redundant comments.
- Add comments when adding public methods to help public API documentation generation.
- **Never** add comments just to separate sections of a class or method.

## Structure
- Use a consistent, predictable project layout.
- Create simple, obvious entry points.
- Before scaffolding multiple files, identify shared structure first. Use framework-native / language-native composition patterns.
- **IMPORTANT**: Duplication that requires the same fix in multiple places is a code smell, not a pattern to preserve.

## Functions and Modules
- Keep control flow linear and simple.
- Use small-to-medium functions; avoid deeply nested logic.
- Pass state explicitly; avoid globals.
