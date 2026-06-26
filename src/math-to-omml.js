import katex from "katex";
import { mml2omml } from "mathml2omml";
import { XmlComponent } from "docx";

function extractMathElement(mathmlString) {
  const match = mathmlString.match(/<math[\s\S]*?<\/math>/);
  const mathElement = match ? match[0] : mathmlString;
  // Remove <annotation> elements to avoid mathml2omml warnings and keep output clean
  return mathElement.replace(/<annotation[\s\S]*?<\/annotation>/g, "");
}

function convertDomNodeToDocxJson(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return undefined;
  }

  const children = [];
  const attributes = {};
  if (node.attributes) {
    for (const attr of node.attributes) {
      attributes[attr.name] = attr.value;
    }
  }
  if (Object.keys(attributes).length > 0) {
    children.push({ _attr: attributes });
  }

  for (const child of node.childNodes) {
    const converted = convertDomNodeToDocxJson(child);
    if (converted !== undefined && converted !== "") {
      children.push(converted);
    }
  }

  return { [node.tagName]: children };
}

function ommlXmlToDocxJson(ommlXml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(ommlXml, "application/xml");
  const root = doc.documentElement;
  if (!root || root.tagName === "parsererror") return undefined;
  return convertDomNodeToDocxJson(root);
}

export function latexToOmmlMath(latex) {
  if (!latex || typeof latex !== "string") return null;
  try {
    const mathml = katex.renderToString(latex, { output: "mathml", throwOnError: false });
    const cleanMathml = extractMathElement(mathml);
    const omml = mml2omml(cleanMathml);
    const docxJson = ommlXmlToDocxJson(omml);
    if (!docxJson || !docxJson["m:oMath"]) return null;
    return docxJson["m:oMath"];
  } catch (error) {
    console.error("Failed to convert LaTeX to OMML:", error);
    return null;
  }
}

export class OmmlMath extends XmlComponent {
  constructor(ommlXmlOrDocxJson) {
    super("m:oMath");
    if (typeof ommlXmlOrDocxJson === "string") {
      const docxJson = ommlXmlToDocxJson(ommlXmlOrDocxJson);
      if (docxJson && docxJson["m:oMath"]) {
        this.root.push(...docxJson["m:oMath"]);
      }
    } else if (Array.isArray(ommlXmlOrDocxJson)) {
      this.root.push(...ommlXmlOrDocxJson);
    }
  }
}
