import { describe, expect, it } from "vitest";
import { normalizeMeetLink, meetLinks } from "../src/modules/meet/meet-link.domain";

describe("normalización Meet", () => {
  it.each([
    "jgw-boaw-dgr",
    "https://meet.google.com/jgw-boaw-dgr",
    "meet.google.com/jgw-boaw-dgr",
    "https://meet.google.com/jgw-boaw-dgr?authuser=1",
    " JGW - BOAW - DGR ",
    "j g w - b o a w - d g r",
    "https://MEET.google.com/JGW-BOAW-DGR/?authuser=1#test",
    "https://meet.google.com/lookup/jgw-boaw-dgr",
  ])("normaliza %s", (input) => {
    expect(normalizeMeetLink(input)).toEqual({
      code: "jgw-boaw-dgr",
      url: "https://meet.google.com/jgw-boaw-dgr",
    });
  });
  it.each([
    null,
    {},
    "",
    "x",
    "javascript:jgw-boaw-dgr",
    "https://evil.test/jgw-boaw-dgr",
    "https://meet.google.com.evil.test/jgw-boaw-dgr",
    "jgw-boaw-dgr?authuser=1",
    "https://meet.google.com/jgw-boaw-dgr/extra",
    "a".repeat(2049),
    "foo jgw-boaw-dgr",
  ])("rechaza %s", (input) => {
    expect(normalizeMeetLink(input)).toBeNull();
  });
  it("deduplica y conserva contradicciones", () => {
    expect(meetLinks("JGW-BOAW-DGR", "https://meet.google.com/jgw-boaw-dgr")).toHaveLength(1);
    expect(meetLinks("rsf-wtgp-uxt", "https://meet.google.com/jgw-boaw-dgr")).toHaveLength(2);
    expect(meetLinks(null, null)).toEqual([]);
  });
});
