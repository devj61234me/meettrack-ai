# Use PyMySQL as the MySQL driver.
# It is pure Python, so no C compiler is needed on Windows.
try:
    import pymysql

    pymysql.version_info = (2, 2, 1, "final", 0)  # satisfy Django's driver version check
    pymysql.install_as_MySQLdb()
except ImportError:  # pragma: no cover - only when PyMySQL is missing
    pass
