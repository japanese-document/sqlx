{ "header": {"name": "sqlx", "order": 0}, "order": 0 }
---
# sqlx

`sqlx`は優れたビルトイン`database/sql`パッケージを拡張したGoのパッケージです。

このドキュメントは`sqlx`のGoでの使い方にフォーカスしています。
だから、このドキュメントで使われているSQLがベストプラクティスとは限りません。
また、ここではGo開発環境のセットアップ、GoやSQLの基本的な使い方については扱っていません。

これ以降では標準のerr変数を使用してエラーが返されていますが、簡潔にするためにこれらを無視しています。
実際のプログラムでは絶対にすべてのエラーを確認してください。

## 参考資料

GoでSQLを使用する方法についての優れたドキュメントは他にもあります。

* [database/sqlドキュメント](https://golang.org/pkg/database/sql/)
* [go-database-sqlチュートリアル](http://go-database-sql.org/)

Goの使い方を学習したい場合は、以下のドキュメントをお勧めします。

- [The Go tour](https://tour.golang.org)
- [How to write Go code](https://golang.org/doc/code.html)
- [Effective Go](https://golang.org/doc/effective_go.html)

`database/sql`インターフェースは`sqlx`のサブセットです。
だから、これらのドキュメントにある`database/sql`の使い方に関する情報は`sqlx`でも通用します。

## はじめに

`sqlx`とデータベースドライバーをインストールする必要があります。
データベースのインストールなどの環境構築を省くために、ここではmattnのsqlite3ドライバをインストールします。

```bash
$ go get github.com/jmoiron/sqlx
$ go get github.com/mattn/go-sqlite3
```

## データベース操作に関連した型

`sqlx`は`database/sql`と同じような感じになるようにしています。
`sqlx`には4つの主要なデータベース操作に関連した型(Handle Types)があります。

* `sqlx.DB` - `sql.DB`に類似しており、データベースの表現です。
* `sqlx.Tx` - `sql.Tx`に類似しており、トランザクションの表現です。
* `sqlx.Stmt` - `sql.Stmt`に類似しており、準備されたステートメントの表現です。
* `sqlx.NamedStmt` - [名前付きパラメータ](#namedParams)をサポートする準備されたステートメントの表現です。

データベース操作に関連した型はすべて、`database/sql`の同等物を[埋め込み(Embedding)](https://golang.org/doc/effective_go.html#embedding)しています。
つまり、`sqlx.DB.Query`を呼び出すとき、`sql.DB.Query`と同じコードを呼び出しています。
これにより、既存のコードベースに簡単に導入することができます。

これに加えて、2つの*カーソル*タイプがあります：

* `sqlx.Rows` - `sql.Rows`に類似しており、`Queryx`から返されるカーソルです。
* `sqlx.Row` - `sql.Row`に類似しており、`QueryRowx`から返される結果です。

データベース操作に関連した型と同様に、`sqlx.Rows`は`sql.Rows`を埋め込んでいます。
基本的な実装がアクセス不可能だったため、`sqlx.Row`は`sql.Row`の部分的な再実装であり、標準インターフェースを維持しています。

### データベースへの接続

`DB`インスタンスは接続そのものではなく、データベースを抽象化したものです。
これがDBを作成してもエラーが返されず、パニックにならない理由です。
`sqlx`は内部に[コネクションプール](#コネクションプール)を保持しており、初めて接続が必要になった時に接続を試みます。
下記のように、`sqlx.DB`は`Open`を使って作成する、もしくは既存の`sql.DB`を`NewDb`に渡すことで作成することができます。

```go
var db *sqlx.DB

// ビルトインと全く同じ
db = sqlx.Open("sqlite3", ":memory:")

// 既存のsql.DBを使って作成する(ドライバ名が必要なことに注意)
db = sqlx.NewDb(sql.Open("sqlite3", ":memory:"), "sqlite3")

// 強制的に接続して、正常に動作するかテストする
err = db.Ping()
```

DBをオープンと接続をまとめて行いたい場合もあるかもしれません。
(例: 初期化フェーズ中に設定の問題を検出する)
`Connect`を使うとDBのオープンと接続をまとめて行うことができます。
`Connect`は新しいDBをオープンして`Ping`を試みます。
エラーが発生した場合にパニックを起こす`MustConnect`は、パッケージのモジュールレベルで使用することに適しています。

```go
var err error
// オープンして接続する
db, err = sqlx.Connect("sqlite3", ":memory:")

// オープンして接続し、エラー時にパニックを起こす
db = sqlx.MustConnect("sqlite3", ":memory:")
```

## クエリ入門

下記のように`sqlx`におけるデータベース操作に関連した型は、データベースへのクエリに関する同じ基本的な関数を実装しています。

* `Exec(...) (sql.Result, error)` - `database/sql`から変更なし
* `Query(...) (*sql.Rows, error)` - `database/sql`から変更なし
* `QueryRow(...) *sql.Row` - `database/sql`から変更なし

下記はこれらのビルトイン関数への拡張です。

* `MustExec() sql.Result` - `Exec`の拡張、エラーが発生した場合はpanicします
* `Queryx(...) (*sqlx.Rows, error)` - `Query`の拡張、`sqlx.Rows`を返します
* `QueryRowx(...) *sqlx.Row` - `QueryRow`の拡張、`sqlx.Row`を返します

下記は加えられた全く新しい関数です。

* `Get(dest interface{}, ...) error`
* `Select(dest interface{}, ...) error`

変更されていないインターフェースの関数から新しい関数へこれらの使い方を説明してきます。

### Exec

`Exec`と`MustExec`はコネクションプールから接続を取得します。
そして、渡されたクエリをデータベースサーバ上で実行します。
この時、アドホックなクエリ実行をサポートしていないドライバの場合、自動的にプリペアドステートメントが作成されて実行されることがあります。
そして、結果が返される前に接続をコネクションプールに返します。

```go
schema := `CREATE TABLE place (
    country text,
    city text NULL,
    telcode integer);`

// データベースサーバでクエリを実行する
result, err := db.Exec(schema)

// または、エラー時にパニックを起こすMustExecを使うことができます
cityState := `INSERT INTO place (country, telcode) VALUES (?, ?)`
countryCity := `INSERT INTO place (country, city, telcode) VALUES (?, ?, ?)`
db.MustExec(cityState, "Hong Kong", 852)
db.MustExec(cityState, "Singapore", 65)
db.MustExec(countryCity, "South Africa", "Johannesburg", 27)
```

[Result](https://golang.org/pkg/database/sql/#Result)には`LastInsertId()`と`RowsAffected()`という2つの関数があります。
これらはドライバによって利用可能かどうかが異なります。
例えばMySQLではオートインクリメントキーを持つ挿入については`LastInsertId()`が利用可能です。
一方、PostgreSQLではこの情報は`RETURNING`句を使用して通常の行カーソルから取得する必要があります。

#### バインド変数(bindvars)

クエリ内のプレースホルダである`?`は、内部的にバインド変数(bindvars)と呼ばれます。
データベースサーバに値を送る際には、これらを *常に* 使用すべきです。
なぜなら、SQLインジェクション攻撃を防ぐことができるからです。
`database/sql`はクエリテキストに対して *何の* 検証も行いません。
クエリはエンコードされたパラメータと共にそのままデータベースサーバに送信されます。
ドライバが特別なインターフェースを実装していない限り、クエリは実行前にまずデータベースサーバで準備されます。
また、下記のようにバインド変数はデータベースによって異なります。

* MySQLは上記の`?`構文を使用します。
* PostgreSQLは列挙された`$1`、`$2`などのバインド変数構文を使用します。
* SQLiteは`?`と`$1`の両方の構文を受け入れます。
* Oracleは`:name`構文を使用します。

他のデータベースは異なる場合があります。
現在のデータベースタイプで実行に適したクエリを取得するために、`sqlx.DB.Rebind(string) string`関数を`?`バインド変数構文と共に使用できます。

バインド変数に関する一般的な誤解は、それらが補間に使用されるということです。
バインド変数は *パラメータ化* のためだけに使用され、[SQL文の構造を変更することは許されていません](https://use-the-index-luke.com/sql/where-clause/bind-parameters)。
たとえば、バインド変数を使用して列名やテーブル名をパラメータ化しようとすると機能しません。

```
// 機能しない
db.Query("SELECT * FROM ?", "mytable")

// これも機能しない
db.Query("SELECT ?, ? FROM people", "name", "location")
```

### Query

`Query`は`database/sql`を使用して行の結果を返すクエリを実行します。
下記のように`Query`は`sql.Rows`オブジェクトとエラーを返します。

```go
// placeテーブルからすべてのデータを取得する 
rows, err := db.Query("SELECT country, city, telcode FROM place")

// 各行を反復処理する
for rows.Next() {
    var country string
    // cityはNULLになる可能性があるため、NullString型を使用する
    var city    sql.NullString
    var telcode int
    err = rows.Scan(&country, &city, &telcode)
}
```

`Rows`はクエリの結果を格納したリストというよりは、データベースカーソルのように扱うべきです。
ドライバのバッファリング動作は異なる場合がありますが、`Next()`を使って反復処理することは、大きな結果セットのメモリ使用量を制限する良い方法です。
なぜなら、一度に1行ずつしかスキャン(scan)するからです。
`Scan()`は[reflect](https://golang.org/pkg/reflect)を使用して、sqlの列の戻り値の型を`string`、`[]byte`などのGoの型にマッピングします。
全ての行の結果を反復処理しない場合は、接続をコネクションプールに戻すために`rows.Close()`を必ず呼び出してください。

`Query`によって返されるエラーは、サーバ上での準備や実行中に発生した可能性のあるエラーです。
これには、コネクションプールから不良な接続を取得することも含まれますが、`database/sql`は動作するコネクションを見つけたり作成したりするために[10回まで再試行](https://golang.org/src/pkg/database/sql/sql.go?s=23888:23957#L885)します。
一般的に、エラーは不正なSQL構文、型の不一致、または不正なフィールドやテーブル名によるものでしょう。

ほとんどの場合、`Rows.Scan`はドライバがバッファをどのように再利用するかを知らないため、ドライバから取得したデータをコピーします。
`sql.RawBytes`型の値を`Scan()`に渡すとドライバから実際に返されたデータの *ゼロコピー* バイトスライスを取得することがきます。
次の`Next()`の呼び出し後、そのような値は有効でなくなります。
なぜなら、そのメモリはドライバによって上書きされている可能性があるからです。

`Query`によって使用される接続は`Next`による反復処理で全ての行が使い果たされるか、`rows.Close()`が呼び出されるまでオープンなままです。
詳細については、[コネクションプール](#コネクションプール)のセクションを参照してください。

`sqlx`の`Queryx`は`Query`と全く同じように動作しますが、新たに機能追加されたスキャン(scan)を持つ`sqlx.Rows`を返します。

```go
type Place struct {
    Country       string
    City          sql.NullString
    TelephoneCode int `db:"telcode"`
}

rows, err := db.Queryx("SELECT * FROM place")
for rows.Next() {
    var p Place
    err = rows.StructScan(&p)
}
```

`sqlx.Rows`のよく使う追加された機能は`StructScan()`です。
これにより結果が自動的に渡された構造体のフィールドに割り当てられます。
`sqlx`がそれらに書き込むことができるためには、フィールドが[エクスポートされている](https://golang.org/doc/effective_go.html#names)(大文字で始まる)必要があることに注意してください。
これはGoの *すべて* のマーシャラー(marshaller)に当てはまることです。
`db`構造体タグを使用して、どの列名が各構造体フィールドにマップするかを指定するか、[db.MapperFunc()](#mapping)を使って新しいデフォルトマッピングを設定できます。
`StructScan()`のデフォルトの動作はフィールド名に`strings.Lower`を使用して列名と一致させることです。
`StructScan`、`SliceScan`、`MapScan`に関する詳しい情報は[詳細なScanに関するセクション](#advancedScanning)を見てください。

### QueryRow

`QueryRow`はサーバから1行を取得します。
`QueryRow`はコネクションプールから接続を取得し、`Query`を使用してクエリを実行し、内部に`Rows`オブジェクトを持つ`Row`オブジェクトを返します。

```go
row := db.QueryRow("SELECT * FROM place WHERE telcode=?", 852)
var telcode int
err = row.Scan(&telcode)
```

`Query`とは異なり、`QueryRow`はエラーなしで`Row`型の結果を返します。
これにより、返されたものから直接`Scan`を連鎖させることが安全になります。
クエリの実行中にエラーが発生した場合、そのエラーは`Scan`によって返されます。
該当する行がない場合、`Scan`は`sql.ErrNoRows`を返します。
スキャン自体が失敗した場合(例えば型の不一致のため)、そのエラーも返されます。

`Row`結果内の`Rows`構造体は`Scan`時にクローズされます。
つまり、`QueryRow`によって使用されるコネクションは、結果をスキャンするまで開いたままです。
また、これは`sql.RawBytes`がここで使用できないことも意味します。
なぜなら、参照されたメモリはドライバに属しており、呼び出し元に制御が戻る時には既に無効になっている可能性があるからです。

`sqlx`の`QueryRowx`は`sql.Row`の代わりに`sqlx.Row`を返します。
上記および[高度なスキャン](#高度なスキャン)で説明されているように、`sqlx.Rows`と同じスキャン機能を実装しています。

```go
var p Place
err := db.QueryRowx("SELECT city, telcode FROM place LIMIT 1").StructScan(&p)
```

### GetとSelect

`Get`と`Select`は、データベース操作に関連した型の処理をまとめた関数です。
具体的にはクエリの実行と柔軟なスキャンをまとめています。
これらの処理を説明するために、ここでの`スキャン可能`の定義を示します。

* 値が構造体でなければスキャン可能です。例えば`string`、`int`など
* `sql.Scanner`を実装していればスキャン可能です(例：`time.Time`)
* エクスポートされたフィールドを持たない構造体であればスキャン可能です

`Get`と`Select`はスキャン可能な型に対して、`rows.Scan`と`rows.StructScan`をスキャン不可能な型に対して使います。
`Get`と`Select`は`QueryRow`と`Query`に似ています。
`Get`は結果を1つ取得してスキャンすることに使います。
`Select`は結果のスライスを取得することに使います。

```go
p := Place{}
pp := []Place{}

// これは最初のレコードをpに割り当てます
err = db.Get(&p, "SELECT * FROM place LIMIT 1")

// これはtelcodeが50より大きいレコードをスライスppに割り当てます。
err = db.Select(&pp, "SELECT * FROM place WHERE telcode > ?", 50)

// intも利用可能です。
var id int
err = db.Get(&id, "SELECT count(*) FROM place")

// 名前を最大10個取得します。
var names []string
err = db.Select(&names, "SELECT name FROM place LIMIT 10")
```

`Get`と`Select`は、クエリ実行中に作成された`Rows`を閉じ、プロセスのどの段階で発生したエラーでも返します。
`StructScan`を内部的に使用しているため、[高度なスキャン](#高度なスキャン)に記載されている詳細も`Get`と`Select`に適用されます。

`Select`はコードを短くすることができますが、注意が必要です！
これは`Queryx`と内部処理に異なり、結果セット全体を一度にメモリにロードします。
その結果セットがクエリによって何らかの合理的なサイズに制限されていない場合、
メモリを節約するために`Queryx`/`StructScan`の反復処理を使った方が良いかもしれません。

## トランザクション

トランザクションを使用するには、`DB.Begin()`でトランザクションハンドルを作成する必要があります。
以下のようなコードは **機能しません**：

```go
// コネクションプールが1より大きい場合、これは機能しません
db.MustExec("BEGIN;")
db.MustExec(...)
db.MustExec("COMMIT;")
```

`Exec`や他のすべてのクエリ関数は、DBにコネクションを要求し、その都度プールに返します。
BEGIN文が実行されたのと同じコネクションを受け取る保証はありません。
したがって、トランザクションを使用するには`DB.Begin()`を使用する必要があります。

```go
tx, err := db.Begin()
err = tx.Exec(...)
err = tx.Commit()
```

`sqlx`はDBハンドルを生成するために`Beginx()`と`MustBegin()`を用意しています。
これらは`sql.Tx`の代わりに`sqlx.Tx`を返します。

```go
tx := db.MustBegin()
tx.MustExec(...)
err = tx.Commit()
```

`sqlx.Tx`には、`sqlx.DB`が持つすべての追加された関数があります。

トランザクションはコネクションの状態であるため、`Tx`オブジェクトはプールから1つのコネクションをバインドし制御する必要があります。
Txはそのライフサイクル全体で1つのコネクションを維持し、`Commit()`または`Rollback()`が呼び出されたときにのみそれを解放します。
ガベージコレクションまでコネクションが保持されるのを防ぐため、これらのうち少なくとも1つを呼び出すように注意してください。

トランザクションでは1つのコネクションのみを使用するため、一度に1つのステートメントのみを実行できます。
カーソルタイプの`Row`と`Rows`は、別のクエリを実行する前にそれぞれ`Scanned`または`Closed`される必要があります。
サーバーが結果を送信している最中にデータを送信しようとすると、接続が破損する可能性があります。

最後に、Txオブジェクトはデータベースサーバで実際の動作を意味するものではありません。
BEGIN文を実行して1つのコネクションをバインドするだけです。
トランザクションの実際の動作(ロックや[分離](https://en.wikipedia.org/wiki/Isolation_(database_systems))などを含む)は完全に仕様が決まっていません。
それらはデータベース依存です。

## プリペアドステートメント

ほとんどのデータベースではクエリが実行される毎に自動的にそのクエリのプリペアドステートメントを内部で作成しています。
しかし、下記のように`sqlx.DB.Prepare()`を使うと、他の場所で再利用するために明示的にステートメントを準備(prepare)することができます。

```go
stmt, err := db.Prepare(`SELECT * FROM place WHERE telcode=?`)
row = stmt.QueryRow(65)

tx, err := db.Begin()
txStmt, err := tx.Prepare(`SELECT * FROM place WHERE telcode=?`)
row = txStmt.QueryRow(852)
```

`Prepare`はデータベースサーバでステートメントの準備を行うために接続が必要です。
`database/sql`はこれを抽象化し、新しいコネクションでステートメントを自動的に作成することで、1つの`Stmt`オブジェクトを多くのコネクションで同時に実行できるようにします。
`Preparex()`は`sqlx.DB`および`sqlx.Tx`が持つ全ての追加された機能を持つ`sqlx.Stmt`を返します。

```go
stmt, err := db.Preparex(`SELECT * FROM place WHERE telcode=?`)
var p Place
err = stmt.Get(&p, 852)
```

`sql.Tx`オブジェクトには既存のステートメントからトランザクション固有のステートメントを返す`Stmt()`メソッドがあります。
`sqlx.Tx`には`Stmtx`バージョンがあり、既存の`sql.Stmt` *または* `sqlx.Stmt`から新しいトランザクション固有の`sqlx.Stmt`を作成します。

## クエリヘルパー

`database/sql`パッケージは実際のクエリテキストに対して何も行いません。
これにより、コード内で特定のデータベースエンジン専用の機能を使用することが非常に簡単になります。
データベースプロンプトで行うようにクエリをそのまま書くことができます。
これは非常に柔軟ですが特定の種類のクエリを書くことが難しくなります。

### IN句

`database/sql`はクエリを検査せず、引数をそのままドライバに渡すため、IN句を含むクエリの扱いが難しくなります：

```sql
SELECT * FROM users WHERE level IN (?);
```

このクエリがデータベースサーバでステートメントとして準備されると、バインド変数`?`は　*１つ*　の引数にのみ対応します。
しかし、通常はいくつかのスライスの長さに応じて変数数の引数であることが望まれます。例えば

```go
var levels = []int{4, 6, 7}
rows, err := db.Query("SELECT * FROM users WHERE level IN (?);", levels)
```

このパターンは、最初に`sqlx.In`でクエリを処理することにより可能になります：

```go
var levels = []int{4, 6, 7}
query, args, err := sqlx.In("SELECT * FROM users WHERE level IN (?);", levels)

// sqlx.Inは`?`バインド変数でクエリを返します。これを使用しているデータベースエンジン用にに再バインドできます。
query = db.Rebind(query)
rows, err := db.Query(query, args...)
```

`sqlx.In`が行うことはそれに渡されたクエリ内の任意のバインド変数を引数内のスライスに対応するスライスの長さに拡張します。
そして、そのスライス要素を新しい引数リストに追加することです。
これは`?`バインド変数のみで行われます。
データベースエンジンに適合したクエリに変換ために`db.Rebind`を使います。

### 名前付きクエリ

名前付きクエリは多くの他のデータベースパッケージで一般的です。
これらはバインド変数構文を使用し、構造体のフィールド名やマップのキー名に基づいてクエリ変数をバインドすることを可能にします。
これにより、バインド変数の位置に基づいてすべてのクエリ変数を参照する必要がなくなります。
構造体フィールドの命名規則は`StructScan`に従い、`NameMapper`および`db`構造体タグを使用します。
名前付きクエリに関連する追加のクエリ関数は次のとおりです：

* `NamedQuery(...) (*sqlx.Rows, error)` - `Queryx`と似ていますが、名前付きバインド変数を使用します。
* `NamedExec(...) (sql.Result, error)` - `Exec`と似ていますが、名前付きバインド変数を使用します。

そして、追加のデータベース操作に関連した型が1つあります：

* `NamedStmt` - 名前付きバインド変数で準備できる`sqlx.Stmt`です。

```go
// 構造体を使った名前付きクエリ
p := Place{Country: "South Africa"}
rows, err := db.NamedQuery(`SELECT * FROM place WHERE country=:country`, p)

// マップを使った名前付きクエリ
m := map[string]interface{}{"city": "Johannesburg"}
result, err := db.NamedExec(`SELECT * FROM place WHERE city=:city`, m)
```

名前付きクエリの実行と準備は構造体とマップの両方で行われます。
下記のように名前付きステートメントを準備して、クエリ関数を実行します。

```go
type Place struct {
    TelephoneCode int `db:"telcode"`
}
pp := []Place{}

// telcode > 50の全てを選択
nstmt, err := db.PrepareNamed(`SELECT * FROM place WHERE telcode > :telcode`)
err = nstmt.Select(&pp, p)
```

名前付きクエリの処理は`:param`構文のクエリ解析と基になるデータベースがサポートするバインド変数への置き換えます。
そして、実行に変数をマッピングします。
したがって、`sqlx`がサポートする任意のデータベースで使用可能です。
下記のように、`sqlx.Named`を使用することもできます。
これは`sqlx.In`と組み合わせて使用することができます。

```go
arg := map[string]interface{}{
    "published": true,
    "authors": []{8, 19, 32, 44},
}
query, args, err := sqlx.Named("SELECT * FROM articles WHERE published=:published AND author_id IN (:authors)", arg)
query, args, err := sqlx.In(query, args...)
query = db.Rebind(query)
db.Query(query, args...)
```

## 高度なスキャン

`StructScan`は見かけよりも洗練されています。
この関数は埋め込み構造体をサポートし、Goが埋め込み属性やメソッドアクセスに使用するのと同じ優先順位ルールを用いてフィールドに割り当てます。
これの一般的な使用例は、多くのテーブルでテーブルモデルの共通部分を共有することです。
例えば

```go
type AutoIncr struct {
    ID       uint64
    Created  time.Time
}

type Place struct {
    Address string
    AutoIncr
}

type Person struct {
    Name string
    AutoIncr
}
```

上記の構造体では、`Person`と`Place`は共に`StructScan`から`id`と`created`列を受け取ることができます。
なぜなら、それらは`AutoIncr`構造体を埋め込んでおり、それがこれらを定義しているからです。この機能により、結合のための臨時テーブルを迅速に作成することができます。
また、この機能は再帰的にも動作します。
以下の例では、`Person`の`Name`とその`AutoIncr`の`ID`と`Created`フィールドが、Goのドット演算子(例: `employee.id`)と`StructScan`(例: `id`カラムの値を`employee.id`に格納する)の両方を通してアクセス可能です。

```go
type Employee struct {
    BossID uint64
    EmployeeID uint64
    Person
}
```

非埋め込み構造体に対しても、以前は`sqlx`がこの機能をサポートしていました。しかし、これは混乱を招く原因となりました。
というのも、ユーザーがこの機能を使って関係性を定義し、下記のように同じ構造体を二度埋め込むことと同じ効果が生じるような構造体を定義しました。

```go
type Child struct {
    Father Person
    Mother Person
}
```

これにはいくつかの問題があります。
Goでは、子孫のフィールドをシャドウ（覆い隠す）することは動作します。
つまり、埋め込みの例で示した`Employee`が`Name`を定義していれば、それは`Person`の`Name`よりも優先されます。
しかし、*曖昧な*セレクタ(ambiguous selectors)は動作しません。
[ランタイムエラー](https://go.dev/play/p/MGRxdjLaUc)を引き起こします。
`Person`と`Place`に対する効率的なJOINを反映した型を作成したい場合、埋め込んだ`AutoIncr`経由で定義されている`id`列をどこに配置すればよいでしょうか？エラーになるでしょうか？

`sqlx`がフィールド名からフィールドアドレスへのマッピングを構築する方法に従って構造体へのスキャンではカラム名前が構造体ツリーの走査中に二度出会ったかどうかを考慮しません。
したがって、Goとは異なり、`StructScan`はその名前を持つ「最初」に出会ったフィールドを選択します。
Goの構造体フィールドは上から下へと順序付けられており、`sqlx`が優先順位ルールを維持するために幅優先探索を行うため、これは最も浅く、最も上部の定義で発生します。
例えば、次の型では

```go
type PersonPlace struct {
    Person
    Place
}
```

`StructScan`は`id`列の結果を`Person.AutoIncr.ID`に設定し、`Person.ID`としてもアクセスできます。
混乱を避けるためには、SQLで`AS`を使用して列エイリアスを作成することをお勧めします。

### スキャン先の安全性について

デフォルトでは、`StructScan`はカラムが対象のフィールドにマッピングされていない場合にエラーを返します。
これはGoでの未使用変数の扱いに似ていますが、`encoding/json` のような標準ライブラリのマーシャラーの動作とは一致しません。
SQLは一般的にJSONのパースよりも予め定義された方法で実行されます。
これらのエラーは通常コーディングエラーだと判断したので、デフォルトでエラーを返すことに決められました。

未使用の変数と同様に、無視されるカラムはネットワークやデータベースのリソースの無駄です。
そして、不適合なマッピングや構造体タグのタイポなどを早期に検出するのは、マッパーが何かが見つからなかったことを教えてくれない限り難しいでしょう。

それにもかかわらず、マッピング対象がないカラムを無視したい場合もあります。
そのために、安全性をオフにしたそのデータベース操作に関連した型のインスタンスの新しいコピーを返す`Unsafe`メソッドがあります。

```go
var p Person
// ここでのerrはnilではありません。`place`のカラムに対応するフィールドがありません
err = db.Get(&p, "SELECT * FROM person, place LIMIT 1;")

// これはエラーを返しません、`place`のカラムに対応するフィールドがなくても
udb := db.Unsafe()
err = udb.Get(&p, "SELECT * FROM person, place LIMIT 1;")
```

### 名前マッピングの制御

`StructScans`でデータの保存先として使用される構造体のフィールドは、`sqlx`によってアクセス可能であるために大文字でなければなりません。
このため、`sqlx`は *NameMapper* を使用してフィールド名に`strings.ToLower`を適用し、行結果のカラムにマッピングします。
これはスキーマによっては常に望ましいわけではないので、`sqlx`ではマッピングをいくつかの方法でカスタマイズすることができます。

これらの方法の中で最もシンプルなのは、`sqlx.DB.MapperFunc`を使用してDBハンドルに設定することです。
`func(string) string`型の引数を受け取ります。
特定のマッパーが必要なライブラリを使用しており、受け取った`sqlx.DB`を汚染したくない場合は、特定のデフォルトマッピングを保証するためにライブラリで使用するためのコピーを作成することができます：

```go
// もしDBスキーマがALLCAPSカラムを使用している場合、通常のフィールドを使うことができます
db.MapperFunc(strings.ToUpper)

// あるライブラリが小文字のカラムを使用していると仮定すると、コピーを作成することができます
copy := sqlx.NewDb(db.DB, db.DriverName())
copy.MapperFunc(strings.ToLower)
```

各`sqlx.DB`は`sqlx/reflectx`パッケージの[Mapper](https://godoc.org/github.com/jmoiron/sqlx/reflectx#Mapper)を使用してこのマッピングを行います。
各`sqlx.DB`はアクティブなマッパーを`sqlx.DB.Mapper`として公開しています。
DBに直接設定することで、さらにマッピングをカスタマイズすることができます。

```go
import "github.com/jmoiron/sqlx/reflectx"

// "db"の代わりに構造体フィールドタグ"json"を使用する新しいマッパーを作成する
db.Mapper = reflectx.NewMapperFunc("json", strings.ToLower)
```

### スライスやマップにスキャンする

`Scan`や`StructScan`だけでなく、`sqlx`の`Row`や`Rows`は結果をスライスやマップに格納するメソッドを持っています。

```go
rows, err := db.Queryx("SELECT * FROM place")
for rows.Next() {
    // colsはすべてのカラム結果の[]interface{}です
    cols, err := rows.SliceScan()
}

rows, err := db.Queryx("SELECT * FROM place")
for rows.Next() {
    results := make(map[string]interface{})
    err = rows.MapScan(results)
}
```

`SliceScan`はすべてのカラムの`[]interface{}`を返し、第三者のためにクエリを実行している[situations](http://wts.jmoiron.net)のような状況で、どのカラムが返されるかわからない場合に便利です。
`MapScan`も同様の方法で動作しますが、キーをカラム名、値を`interface{}`のマップにマッピングします。
ここでの重要な注意点は、`rows.Columns()`によって返される結果にはテーブル名を含むカラム名が含まれていないので、`SELECT a.id, b.id FROM a NATURAL JOIN b`は`[]string{"id", "id"}`のカラム名の配列になり、マップ内の1つの結果が上書きされることです。

## カスタムタイプ

上記の例ではすべてビルトインのタイプを使用してスキャンやクエリを行っていますが、
`database/sql`は任意のカスタムタイプを使用するためのインターフェースを提供しています。

* `sql.Scanner`はScan()でカスタムタイプを使用するために使用されます
* `driver.Valuer`はQuery/QueryRow/Execでカスタムタイプを使用するために使用されます

これらは標準的なインターフェースであり、`database/sql`の上にサービスを提供している可能性のある任意のライブラリに移植性を保証するために使用されます。
これらの使用方法の詳細については、[このブログ記事を読む](http://jmoiron.net/blog/built-in-interfaces)か、
いくつかの標準的で有用なタイプを実装している[sqlx/types](https://github.com/jmoiron/sqlx/blob/master/types/types.go)パッケージを確認してください。

## コネクションプール

ステートメントの準備とクエリの実行には接続が必要です。
DBオブジェクトは接続のプールを管理して、並行クエリで安全に使用できるようにします。
Go 1.2時点でコネクションプールのサイズを制御する方法は2つあります。

* `DB.SetMaxIdleConns(n int)`
* `DB.SetMaxOpenConns(n int)`

デフォルトではプールは無制限に拡大します。
そして、プール内に利用可能な接続がない場合はいつでも接続が作成されます。
`DB.SetMaxOpenConns`を使用してプールの最大サイズを設定できます。
使用されていない接続はアイドル状態とされ、必要がなければ閉じられます。
接続を頻繁に作成・閉鎖することを避けるために、`DB.SetMaxIdleConns`を使用してクエリ負荷に合理的なサイズで最大アイドルサイズを設定します。

接続を誤って保持することにより問題が発生しやすいです。
これを防ぐために以下のことに注意してください。

* すべてのRowオブジェクトで`Scan()`を確実に行います
* すべてのRowsオブジェクトを`Close()`するか、`Next()`を使用して完全に繰り返します
* すべてのトランザクションが`Commit()`か`Rollback()`を使用して接続を返します

これらのいずれかを怠ると、それらが使用する接続はガベージコレクションまで保持される可能性があります。
DBは使用中のものを補うために一度にはるかに多くの接続を作成することになります。
`Rows.Close()`は何度でも安全に呼び出すことができるので、必要がない場合でもそれを呼び出しても大丈夫です。

---

## License

MIT License

Copyright (c) 2013, Jason Moiron

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.