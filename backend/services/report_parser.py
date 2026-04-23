"""
report_parser.py — Extract text from PDF (PyMuPDF) or images.

OCR is performed exclusively via OpenRouter vision models (no local Tesseract
binary). PyMuPDF is used to extract text from text-based PDFs and to render
scanned PDF pages to images that are then sent through vision OCR.
"""
import io
import logging

from services.claude_service import extract_text_from_image_vision

logger = logging.getLogger(__name__)

NO_TEXT_MESSAGE = (
    "(No readable text could be extracted from this file. "
    "Please upload a clearer image or a text-based PDF.)"
)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Use PyMuPDF (fitz) to extract text from a text-based PDF."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        all_text = []
        for page in doc:
            all_text.append(page.get_text())
        doc.close()
        return "\n".join(all_text).strip()
    except ImportError:
        logger.error("PyMuPDF not installed. Run: pip install pymupdf")
        return ""
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        return ""


async def extract_text_from_image(file_bytes: bytes, content_type: str = "image/png") -> str:
    """Extract text from an image using OpenRouter vision OCR (no Tesseract)."""
    mime = content_type if content_type in (
        "image/png", "image/jpeg", "image/jpg", "image/webp"
    ) else "image/png"
    text = await extract_text_from_image_vision(file_bytes, mime=mime)
    logger.info(f"Image OCR result length: {len(text)} chars")
    return text


async def extract_text_from_scanned_pdf(file_bytes: bytes) -> str:
    """
    Render each PDF page to PNG and run vision OCR on it via OpenRouter.
    """
    try:
        import fitz
        from PIL import Image

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        all_text: list[str] = []
        for page_index, page in enumerate(doc):
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            page_bytes = buf.getvalue()

            page_text = await extract_text_from_image_vision(page_bytes, mime="image/png")
            logger.info(f"Scanned PDF page {page_index}: {len(page_text)} chars OCR'd")
            all_text.append(page_text)

        doc.close()
        return "\n".join(all_text).strip()
    except ImportError as e:
        logger.error(f"PyMuPDF/Pillow not installed for scanned-PDF OCR: {e}")
        return ""
    except Exception as e:
        logger.error(f"Scanned PDF OCR failed: {e}")
        return ""


async def parse_uploaded_file(file_bytes: bytes, content_type: str, filename: str) -> str:
    """
    Main entrypoint — return extracted text from any supported file type.
    Strategy:
      - PDF: Try PyMuPDF text extraction first; if empty, fall back to vision OCR.
      - Image (png/jpeg/webp): Direct vision OCR via OpenRouter.
    """
    text = ""

    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        text = extract_text_from_pdf(file_bytes)
        if len(text.strip()) < 50:
            logger.info("PDF text-based extraction yielded little text; using vision OCR fallback")
            text = await extract_text_from_scanned_pdf(file_bytes)

    elif content_type in ("image/jpeg", "image/jpg", "image/png", "image/webp") or \
         filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        text = await extract_text_from_image(file_bytes, content_type)

    if not text.strip():
        logger.warning(f"No text extracted from file: {filename}")
        text = NO_TEXT_MESSAGE

    return text


def looks_like_extraction_failure(text: str) -> bool:
    """True when the extracted text is the placeholder or otherwise unusable."""
    if not text:
        return True
    stripped = text.strip()
    if stripped.startswith("(No readable text"):
        return True
    if len(stripped) < 30:
        return True
    letters = sum(1 for c in stripped if c.isalpha())
    if letters < 20:
        return True
    return False
