from flask import Flask, render_template, jsonify, request
import sqlite3

app = Flask(__name__)

@app.route('/test/')
def test():
    return render_template('index.html')

@app.route("/dashboard/")
def dashboard():
    return render_template("dashboard.html")

@app.route("/kartu-bimbingan/kartu-putih/", methods=["GET", "POST"])
def kartu_putih():
    return render_template('kartu-putih.html')


# @app.route("/api/get/mahasiswa/")
# def get_mahasiswa():
#     conn = sqlite3.connect('./db/database.db')
#     cursor = conn.cursor()

#     cursor.execute("SELECT * FROM mahasiswa")
#     rows = cursor.fetchall()
#     column_names = [description[0] for description in cursor.description]

#     data = []
#     for row in rows:
#         data.append(dict(zip(column_names, row)))
        
#     conn.close()
#     return jsonify(data)

@app.route("/api/get/kartu-putih/")
def get_kartu_putih():
    conn = sqlite3.connect('./db/database.db')
    cursor = conn.cursor()

    cursor.execute("""SELECT 
        k.id_kartu,
        k.nim,
        m.prodi,
        m.nama,
        d1.nama AS 'p1',
        d2.nama AS 'p2',
        k.judul,
        k.tanggal,
        k.nomor_surat
        FROM kartu k
        JOIN mahasiswa m ON k.nim = m.nim
        JOIN dosen d1 ON k.pembimbing_1 = d1.id_dosen
        JOIN dosen d2 ON k.pembimbing_2 = d2.id_dosen WHERE k.tipe = 'Putih' ORDER BY k.id_kartu DESC;""")
    rows = cursor.fetchall()
    column_names = [description[0] for description in cursor.description]
    data = []
    for row in rows:
        data.append(dict(zip(column_names, row)))
        
    conn.close()
    return jsonify(data)


def api_get_mahasiswa(term: str) -> list[dict]:
    """
    Return a list of option objects that match *term*.
    Shape must match what your autocomplete expects
    (e.g. name / nim / prodi keys).
    """
    conn = sqlite3.connect('./db/database.db')
    cur = conn.cursor()
    cur.execute("""
        SELECT nama, nim, prodi
        FROM mahasiswa
        WHERE nama  LIKE ? OR
              nim   LIKE ? OR
              prodi LIKE ?
        LIMIT 20;
    """, (f"%{term}%", f"%{term}%", f"%{term}%"))
    rows = cur.fetchall()
    conn.close()

    return [{"nama": r[0], "nim": r[1], "prodi": r[2]} for r in rows]

@app.get("/api/get/mahasiswa")
def api_get_mahasiswa_query():
    q = request.args.get("q", "").strip()
    if len(q) < 3:
        return jsonify([])
    results = api_get_mahasiswa(q)
    return jsonify(results)


def api_get_dosen(term: str, prodi: str) -> list[dict]:
    """
    Return a list of option objects that match *term*.
    Shape must match what your autocomplete expects
    (e.g. name / nim / prodi keys).
    """
    conn = sqlite3.connect('./db/database.db')
    cur = conn.cursor()
    if prodi:
        cur.execute("""
            SELECT id_dosen, nama, prodi
            FROM dosen
            WHERE nama  LIKE ? AND
                  prodi LIKE ?
            LIMIT 20;
        """, (f"%{term}%", f"%{prodi}%"))
    else:
        cur.execute("""
            SELECT id_dosen, nama, prodi
            FROM dosen
            WHERE nama  LIKE ?
            LIMIT 20;
        """, (f"%{term}%",))
    rows = cur.fetchall()
    conn.close()

    return [{"id_dosen": r[0], "nama": r[1], "prodi": r[2]} for r in rows]


@app.get("/api/get/dosen")
def api_get_dosen_query():
    q = request.args.get("q", "").strip()
    prodi = request.args.get("prodi", "").strip()
    if len(q) < 3:
        return jsonify([])
    results = api_get_dosen(q, prodi)
    return jsonify(results)

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5678)
