from flask import Flask, render_template, jsonify
import sqlite3

app = Flask(__name__)

@app.route("/dashboard/")
def dashboard():
    return render_template("dashboard.html")

@app.route("/kartu-bimbingan/kartu-putih/", methods=["GET", "POST"])
def kartu_putih():
    return render_template('kartu-putih.html')


@app.route("/api/get/dosen/")
def get_dosen():
    conn = sqlite3.connect('./db/database.db')
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM dosen")
    rows = cursor.fetchall()
    column_names = [description[0] for description in cursor.description]

    data = []
    for row in rows:
        data.append(dict(zip(column_names, row)))

    conn.close()
    return jsonify(data)

@app.route("/api/get/mahasiswa/")
def get_mahasiswa():
    conn = sqlite3.connect('./db/database.db')
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM mahasiswa")
    rows = cursor.fetchall()
    column_names = [description[0] for description in cursor.description]

    data = []
    for row in rows:
        data.append(dict(zip(column_names, row)))
        
    conn.close()
    return jsonify(data)

@app.route("/api/get/kartu-putih/")
def get_kartu_putih():
    conn = sqlite3.connect('./db/database.db')
    cursor = conn.cursor()

    cursor.execute("""SELECT 
        k.nim,
        m.nama AS 'Nama Mahasiswa',
        d1.nama AS 'Nama Pembimbing 1',
        d2.nama AS 'Nama Pembimbing 2',
        k.judul,
        k.tanggal,
        k.nomor_surat AS 'Nomor Surat'
        FROM kartu k
        JOIN mahasiswa m ON k.nim = m.nim
        JOIN dosen d1 ON k.pembimbing_1 = d1.id_dosen
        JOIN dosen d2 ON k.pembimbing_2 = d2.id_dosen WHERE k.tipe = 'Putih' ORDER BY k.id_kartu ASC;""")
    rows = cursor.fetchall()
    column_names = [description[0] for description in cursor.description]
    print(column_names)
    data = []
    for row in rows:
        data.append(dict(zip(column_names, row)))
    print(data[0])
    conn.close()
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5678)
