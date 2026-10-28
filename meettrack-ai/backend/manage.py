#!/usr/bin/env python
import os
import sys


def main():
    # Local development uses the development settings. Production uses core.settings.production.
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
