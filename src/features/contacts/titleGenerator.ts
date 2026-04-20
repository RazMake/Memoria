import type { CareerLevelReference, CareerPathReference, ContactTitlePair } from "./types";

export const CVP_TITLE_PAIR: ContactTitlePair = {
    normal: "CVP",
    short: "CVP",
};

export function generateTitle(careerPath: CareerPathReference, careerLevel: CareerLevelReference): ContactTitlePair {
    return {
        normal: substituteCareerPath(careerLevel.titlePattern, careerPath.name),
        short: substituteCareerPath(careerLevel.titlePattern, careerPath.short),
    };
}

export function generateCanonicalTitlePairs(
    careerPaths: readonly CareerPathReference[],
    careerLevels: readonly CareerLevelReference[],
): ContactTitlePair[] {
    const pairs: ContactTitlePair[] = [];
    const seenNormalTitles = new Set<string>();

    for (const careerPath of careerPaths) {
        for (const careerLevel of careerLevels) {
            if (careerLevel.id < careerPath.minimumCareerLevel) {
                continue;
            }

            const pair = generateTitle(careerPath, careerLevel);
            if (seenNormalTitles.has(pair.normal)) {
                continue;
            }

            seenNormalTitles.add(pair.normal);
            pairs.push(pair);
        }
    }

    if (!seenNormalTitles.has(CVP_TITLE_PAIR.normal)) {
        pairs.push({ ...CVP_TITLE_PAIR });
    }

    return pairs;
}

function substituteCareerPath(pattern: string, careerPathLabel: string): string {
    return pattern.split("{CareerPath}").join(careerPathLabel);
}