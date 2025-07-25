from flask import Flask, render_template, jsonify, request
import sqlite3

app = Flask(__name__)

@app.route('/')
def test():
    return render_template('index.html')

@app.route("/dashboard/")
def dashboard():
    return render_template("dashboard.html")

@app.route("/kartu-bimbingan/kartu-putih/", methods=["GET", "POST"])
def kartu_putih():
    return render_template('kartu-putih.html')

@app.route("/kartu-bimbingan/kartu-kuning/", methods=["GET", "POST"])
def kartu_kuning():
    return render_template('kartu-kuning.html')


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
        d1.id_dosen AS 'p1_id',
        d2.nama AS 'p2',
        d2.id_dosen AS 'p2_id',
        k.judul,
        k.tanggal,
        k.nomor_surat
        FROM kartu k
        JOIN mahasiswa m ON k.nim = m.nim
        JOIN dosen d1 ON k.pembimbing_1 = d1.id_dosen
        JOIN dosen d2 ON k.pembimbing_2 = d2.id_dosen 
        WHERE k.tipe = 'Putih' 
        ORDER BY k.id_kartu DESC;
    """)
    rows = cursor.fetchall()
    column_names = [description[0] for description in cursor.description]
    data = []
    for row in rows:
        data.append(dict(zip(column_names, row)))
        
    conn.close()
    return jsonify(data)

@app.route("/api/get/kartu-kuning/")
def get_kartu_kuning():
    conn = sqlite3.connect('./db/database.db')
    cursor = conn.cursor()

    cursor.execute("""SELECT 
        k.id_kartu,
        k.nim,
        m.prodi,
        m.nama,
        d1.nama AS 'p1',
        d1.id_dosen AS 'p1_id',
        d2.nama AS 'p2',
        d2.id_dosen AS 'p2_id',
        k.judul,
        k.tanggal,
        k.nomor_surat
        FROM kartu k
        JOIN mahasiswa m ON k.nim = m.nim
        JOIN dosen d1 ON k.pembimbing_1 = d1.id_dosen
        JOIN dosen d2 ON k.pembimbing_2 = d2.id_dosen 
        WHERE k.tipe = 'Kuning' 
        ORDER BY k.id_kartu DESC;
    """)
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


@app.post("/api/post/kartu-putih")
def post_kartu_putih():
    data = request.json
    print(data)
    required_keys = ["nim", "judul", "tanggal", "nomor_surat", "p1", "p2"]

    # Validate required fields
    if not all(k in data and data[k] for k in required_keys):
        return jsonify({"error": "Missing required fields"}), 400

    conn = sqlite3.connect("./db/database.db")
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO kartu (nim, judul, tanggal, nomor_surat, pembimbing_1, pembimbing_2, tipe)
        VALUES (?, ?, ?, ?, ?, ?, 'Putih');
    """, (
        data["nim"],
        data["judul"],
        data["tanggal"],
        data["nomor_surat"],
        data["p1"],
        data["p2"],
    ))
    conn.commit()
    conn.close()

    return jsonify({"success": True})


@app.post("/api/update/kartu-putih")
def update_kartu_putih():
    data = request.json
    required = ["id_kartu", "nim", "judul", "tanggal", "nomor_surat", "p1", "p2"]
    if not all(k in data and data[k] for k in required):
        return jsonify({"error": "Missing fields"}), 400

    try:
        conn = sqlite3.connect("./db/database.db")
        cur = conn.cursor()
        cur.execute("""
            UPDATE kartu
            SET nim = ?, judul = ?, tanggal = ?, nomor_surat = ?, pembimbing_1 = ?, pembimbing_2 = ?
            WHERE id_kartu = ? AND tipe = 'Putih'
        """, (
            data["nim"],
            data["judul"],
            data["tanggal"],
            data["nomor_surat"],
            data["p1"],
            data["p2"],
            data["id_kartu"]
        ))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.delete("/api/delete/kartu-putih/<int:id_kartu>")
def delete_kartu_putih(id_kartu):
    conn = sqlite3.connect("./db/database.db")
    cur = conn.cursor()
    cur.execute("DELETE FROM kartu WHERE id_kartu = ?", (id_kartu,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.post("/api/post/kartu-kuning")
def post_kartu_kuning():
    data = request.json
    required_keys = ["nim", "judul", "tanggal", "nomor_surat", "p1", "p2"]

    # Validate required fields
    if not all(k in data and data[k] for k in required_keys):
        return jsonify({"error": "Missing required fields"}), 400

    conn = sqlite3.connect("./db/database.db")
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO kartu (nim, judul, tanggal, nomor_surat, pembimbing_1, pembimbing_2, tipe)
        VALUES (?, ?, ?, ?, ?, ?, 'Kuning');
    """, (
        data["nim"],
        data["judul"],
        data["tanggal"],
        data["nomor_surat"],
        data["p1"],
        data["p2"],
    ))
    conn.commit()
    conn.close()

    return jsonify({"success": True})


@app.post("/api/update/kartu-kuning")
def update_kartu_kuning():
    data = request.json
    required = ["id_kartu", "nim", "judul", "tanggal", "nomor_surat", "p1", "p2"]
    if not all(k in data and data[k] for k in required):
        return jsonify({"error": "Missing fields"}), 400

    try:
        conn = sqlite3.connect("./db/database.db")
        cur = conn.cursor()
        cur.execute("""
            UPDATE kartu
            SET nim = ?, judul = ?, tanggal = ?, nomor_surat = ?, pembimbing_1 = ?, pembimbing_2 = ?
            WHERE id_kartu = ? AND tipe = 'Kuning'
        """, (
            data["nim"],
            data["judul"],
            data["tanggal"],
            data["nomor_surat"],
            data["p1"],
            data["p2"],
            data["id_kartu"]
        ))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.delete("/api/delete/kartu-kuning/<int:id_kartu>")
def delete_kartu_kuning(id_kartu):
    conn = sqlite3.connect("./db/database.db")
    cur = conn.cursor()
    cur.execute("DELETE FROM kartu WHERE id_kartu = ?", (id_kartu,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})



if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5678)

