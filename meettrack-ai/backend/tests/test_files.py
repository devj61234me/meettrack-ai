import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from .base import BaseAPITest

URL = "/api/meetings/extract-text/"
TEXT = "Alice will send the report by Friday. We decided to use the new vendor."


def upload(name, data, content_type="application/octet-stream"):
    return SimpleUploadedFile(name, data, content_type=content_type)


def make_docx(text):
    from docx import Document

    doc = Document()
    doc.add_paragraph(text)
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def make_pdf(text):
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer)
    pdf.drawString(72, 750, text)
    pdf.save()
    return buffer.getvalue()


class FileUploadTests(BaseAPITest):
    def post(self, f):
        return self.client.post(URL, {"file": f}, format="multipart")

    def test_txt_docx_pdf_are_extracted(self):
        for name, data in [("n.txt", TEXT.encode()), ("n.docx", make_docx(TEXT)), ("n.pdf", make_pdf(TEXT))]:
            r = self.post(upload(name, data))
            self.assertEqual(r.status_code, 200, (name, r.data))
            self.assertIn("Alice will send the report", r.data["text"])
            self.assertEqual(r.data["filename"], name)

    def test_unsupported_type_rejected(self):
        r = self.post(upload("virus.exe", b"MZ" + b"0" * 50))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["error"]["code"], "file_unreadable")

    def test_empty_file_rejected(self):
        self.assertEqual(self.post(upload("e.txt", b"")).status_code, 400)

    def test_missing_file_rejected(self):
        self.assertEqual(self.client.post(URL, {}, format="multipart").status_code, 400)

    @override_settings(MAX_UPLOAD_MB=1)
    def test_oversized_file_rejected(self):
        r = self.post(upload("big.txt", b"a" * (1024 * 1024 + 10)))
        self.assertEqual(r.status_code, 400)
        self.assertIn("limit", r.data["error"]["message"])

    def test_fake_docx_and_fake_pdf_rejected(self):
        self.assertEqual(self.post(upload("fake.docx", b"just text, not a zip")).status_code, 400)
        self.assertEqual(self.post(upload("fake.pdf", b"just text, not a pdf")).status_code, 400)

    def test_pdf_without_text_rejected(self):
        from reportlab.pdfgen import canvas

        buffer = io.BytesIO()
        pdf = canvas.Canvas(buffer)
        pdf.rect(10, 10, 100, 100)  # drawing only, like a scanned page
        pdf.save()
        r = self.post(upload("scan.pdf", buffer.getvalue()))
        self.assertEqual(r.status_code, 400)
        self.assertIn("No readable text", r.data["error"]["message"])

    def test_upload_requires_login(self):
        from rest_framework.test import APIClient

        r = APIClient().post(URL, {"file": upload("n.txt", TEXT.encode())}, format="multipart")
        self.assertEqual(r.status_code, 401)
