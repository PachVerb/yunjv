/**
 * 多服务类型类接口封装
 * @param {string} type - 服务类型
 * @param {number} serverindx - 服务索引
 * @param {config} config - 服务配置
 * @param {string} localpath - 本地路径
 * @param {string} remotepath - 服务远程路径
 * @param {object} rowfileinfo - other
 */

const client = require('basic-ftp')
const path = require('path')
const SMB = require('@marsaud/smb2')
const fs = require('fs')
const { SeafileAPI } = require('seafile-js')
import SizeConvert from '@/lib/SizeConvert.js'
import convert from './SizeConvert.js'
import OwnerConvert from './PERMISSIONCONVERT.js'
import store from '@/store/index.js'
import { Buffer } from 'buffer'
import Distinct from '@/lib/arryDuplicateRemove.js'

export default function ServerFactory(
  type,
  serverindx = '',
  config = '',
  localpath = '',
  remotepath = '',
  rowfileinfo = '',
) {
  if (this instanceof ServerFactory) {
    return new this[type](
      serverindx,
      config,
      localpath,
      remotepath,
      rowfileinfo,
    )
  } else {
    throw new Error(
      '[wangshan-warn] the ServerFactory(constructor) must use new keywords! so you can new ServerFactory',
    )
  }
}
// 服务基类添加
ServerFactory.prototype = {
  BaiDu: function(index, config, lpath, remotepath, rowfileinfo) {
    console.log(11111, remotepath, rowfileinfo)
    // 文件信息读取
    this.singleUpload = function(filepath) {
      let stats = fs.statSync(filepath) // 文件信息
      let chunkSize = 4 * Math.pow(1024, 2) // 分片大小
      let size = stats.size // 文件大小
      let pieces = Math.ceil(size / chunkSize) // 文件切片数量
      let filename = path.basename(filepath)

      const stream = fs.createReadStream(lpath)
      let arr = []

      stream.on('data', (data) => {
        arr.push(data)
      })
      stream.on('end', function() {
        var fileC = new File(Buffer.concat(arr), filename)
        // var fileC = Buffer.concat(arr)
        store.commit('upLoadFIlelist', {
          filename,
          chunkSize,
          size,
          pieces,
          lpath,
          fileC,
        })
      })
    }
  },
  SMB: function(serverindx, config) {
    // 首页文件目录加载
    const { host, user, pwd } = config[0]
    this.loadFile = function() {
      let smbData = [] //存放smb数据

      try {
        const smbclient = new SMB({
          share: `\\\\${host}\\share`,
          domain: 'WORKGROUP',
          username: user,
          password: pwd,
          autocloseTimeout: 0,
        })
        console.log(smbclient)
        smbclient.readdir('', (err, files) => {
          if (err) throw err
          let smbFile = {}
          for (const file of files) {
            smbFile = {}
            smbFile.id = Math.random()
            smbFile.parentsPath = ''
            smbFile.path = path.extname(file) ? `${file}` : `${file}\\\\`
            smbFile.server_filename = file
            smbFile.isdir = path.extname(file) ? 0 : 1
            smbData.push(smbFile)
          }
        })
        // smbclient.disconnect()
        return smbData
      } catch (error) {
        console.log(error)
      }
    }
    // 目录创建

    // 文件上传
    this.upload = function(path, destination, parent) {
      console.log(path, destination, parent)
      try {
        var smbclient = new SMB({
          share: `\\\\${host}\\share`,
          domain: 'WORKGROUP',
          username: user,
          password: pwd,
          autocloseTimeout: 0,
        })
        var readStream = fs.createWriteStream(destination + '/2222.docx')
        console.log(fs.statSync(destination + '/2222.docx'))

        smbclient.createReadStream('2222.docx', function(err, data) {
          if (err) throw err
          let chunks = 0
          // let length = 0
          data.on('data', function(chunk) {
            chunks += chunk
          })
          data.on('end', function() {
            store.commit('process', 100)
            readStream.write(chunks)
          })
        })
      } catch (error) {
        console.log(error)
      }
    }
    // 文件下载
    this.download = function(path, destination) {
      // const { host, pwd, user } = config[serverindx]
      console.log(path, destination)
      try {
        var smbclient = new SMB({
          share: `\\\\${host}\\share`,
          domain: 'WORKGROUP',
          username: user,
          password: pwd,
          autocloseTimeout: 0,
        })
        var readStream = fs.createWriteStream(destination)

        smbclient.createReadStream(path, function(err, data) {
          if (err) throw err
          let chunks = 0
          data.on('data', function(chunk) {
            chunks += chunk
          })
          data.on('end', function() {
            store.commit('process', 100)
            store.commit('clearDownTask')
            readStream.write(chunks)
          })
        })
      } catch (err) {
        console.log(err)
      }
    }
  },
  FTP: function(serverindx, config, localpath, remotepath, rowfileinfo) {
    //连接ftp
    const ftp = new client.Client()

    // 服务连接
    this.loadFile = async function() {
      const config = JSON.parse(localStorage.getItem('config'))[serverindx]
      const { host, user, pwd, port } = config
      try {
        await ftp.access({
          host,
          user,
          password: pwd,
          port,
        })
        return ftp.list('')
      } catch (error) {
        alert('登陆超时，请检查你的网络是否正确')
        throw error
      }
    }
    // 文件上传
    this.upload = async function() {
      const formatLocalPath = localpath.split('/')
      const { host, user, pwd, port } = config[serverindx]
      let currentFileInfo = {},
        fileData = []
      ftp.trackProgress((info) => {
        if (info.type == 'upload') {
          let process = (
            (info.bytes / store.state.downloadLists[0].size) *
            100
          ).toFixed(0)
          store.commit('process', process)
          if (process) {
            store.commit('clearDownTask')
          }
        }
      })
      try {
        await ftp.access({
          host,
          user,
          password: pwd,
          port,
        })
        await ftp.uploadFrom(
          localpath,
          `${remotepath}/${formatLocalPath[formatLocalPath.length - 1]}`,
        )
        console.log(
          `${remotepath}/${formatLocalPath[formatLocalPath.length - 1]}`,
        )
        const filelist = await ftp.list(remotepath)
        for (let item of filelist) {
          const { name, size, isDirectory, permissions, date, user } = item
          currentFileInfo = {}
          currentFileInfo.id = (Math.random() + 1) * 10
          currentFileInfo.server_filename = name
          currentFileInfo.size = convert(size)
          currentFileInfo.sizeC = size
          currentFileInfo.parent = path.basename(remotepath)
          currentFileInfo.parentsPath = remotepath
          currentFileInfo.path =
            remotepath == '/' ? `${remotepath}${name}` : `${remotepath}/${name}`
          currentFileInfo.isdir = Number(isDirectory)
          currentFileInfo.local_mtime = date
          currentFileInfo.permission = permissions
            ? OwnerConvert(permissions)
            : ''
          currentFileInfo.Owner = user
          fileData.push(currentFileInfo)
        }

        return fileData
      } catch (error) {
        ftp.close()
        console.log(error, JSON.stringify(error))
      }
      ftp.trackProgress()
    }
    //文件下载
    this.download = async function() {
      const { host, user, pwd, port } = config[serverindx]
      const { server_filename, path, isdir } = rowfileinfo
      ftp.trackProgress((info) => {
        if (info.type == 'download') {
          let process = (
            (info.bytes / store.state.downloadLists[0].sizeC) *
            100
          ).toFixed(0)
          store.commit('process', process)
          if (process) {
            store.commit('clearDownTask')
          }
        }
      })
      try {
        await ftp.access({
          host,
          user,
          password: pwd,
          port,
        })
        if (isdir) {
          return await ftp.downloadToDir(localpath, path)
        } else {
          return await ftp.downloadTo(`${localpath}/${server_filename}`, path)
        }
      } catch (error) {
        ftp.close()
      }
    }
    // 创建目录
    this.createDir = async function(creatName) {
      const { host, user, pwd, port } = config[serverindx]
      let currentFileInfo = {},
        fileData = []
      try {
        await ftp.access({
          host,
          user,
          password: pwd,
          secure: false,
          port,
        })
        await ftp.ensureDir(`${remotepath}/${creatName}-${Math.random()}`)

        await ftp.list(remotepath).then((res) => {
          for (let item of res) {
            const { name, size, isDirectory, permissions, date, user } = item
            currentFileInfo = {}
            currentFileInfo.id = (Math.random() + 1) * 10
            currentFileInfo.server_filename = name
            currentFileInfo.size = SizeConvert(size)
            currentFileInfo.parent = path.basename(remotepath)
            currentFileInfo.parentsPath = remotepath
            currentFileInfo.path =
              remotepath == '/'
                ? `${remotepath}${name}`
                : `${remotepath}/${name}`
            currentFileInfo.isdir = Number(isDirectory)
            currentFileInfo.local_mtime = date
            currentFileInfo.permission = permissions
              ? OwnerConvert(permissions)
              : ''
            currentFileInfo.Owner = user
            fileData.unshift(currentFileInfo)
          }
        })
        ftp.close()
        return fileData
      } catch (error) {
        console.log(error)

        ftp.close()
      }
    }
    //重命名
    this.rename = async function(currentName, newName) {
      const { host, user, pwd, port } = config[serverindx]
      try {
        await client.access({
          host,
          user,
          password: pwd,
          secure: false,
          port,
        })
        await client.rename(
          currentName, //设置要更改的文件/文件夹路径
          `${currentName}/${newName}`, //设置更改后的路径---祖先路径+当前文件名
        )

        await client.list(this.rowDate[1].parentsPath).then((res) => {
          this.tableDatas = []
          for (let [index, item] of res.entries()) {
            const { name, size, isDirectory, modifiedAt } = item
            this.singleFile = {}
            this.singleFile.parent = res.server_filename //行目录名
            //子目录请求内容
            this.singleFile.id = index + Math.random()
            this.singleFile.server_filename = name
            this.singleFile.size = SizeConvert(size)
            this.singleFile.parentsPath = this.rowDate[1].parentsPath
            this.singleFile.path =
              this.rowDate[1].parentsPath == '/'
                ? `${this.rowDate[1].parentsPath}${name}`
                : `${this.rowDate[1].parentsPath}/${name}`
            this.singleFile.isdir = Number(isDirectory)
            this.singleFile.local_mtime = modifiedAt
            this.tableDatas.push(this.singleFile) //把行请求内容加入到表格数据
          }
        })
        this.tableData = this.tableDatas //将新的列表赋给原列表

        this.centerDialogVisible2 = false //关闭模态框
      } catch (error) {
        console.log(error)
        client.close()
      }
    }
  },
  SEAFILE: function(index, config) {
    let seafileAPI = new SeafileAPI(),
      { host, user, pwd } = config[index],
      obj = { server: host, username: user, password: pwd },
      arr = [],
      singleFile = {},
      axiosListDir = [],
      arrDir = [],
      data = []
    seafileAPI.init(obj)
    this.createDir = function() {
      seafileAPI.login().then(async () => {
        let repos = await seafileAPI.listRepos()
        repos.data.repos.forEach((item) => {
          arr.push(item.repo_id)
        })

        Distinct(arr).forEach((item) => {
          axiosListDir.push(seafileAPI.listDir(item, ''))
        })

        await Promise.all(axiosListDir).then((res) => {
          res.forEach((item) => {
            for (let val of item.data.dirent_list) {
              arrDir.push(val)
            }
          })
        })

        for (let item of arrDir) {
          if (item.type == 'file') {
            const { name, size, type, permissions, mtime, parent_dir } = item
            singleFile = {}
            singleFile.id = Math.random()
            singleFile.server_filename = name
            singleFile.size = size
            singleFile.parent = parent_dir
            singleFile.parentsPath = parent_dir
            singleFile.path = `/${name}`
            singleFile.isdir = type == 'file' ? 0 : 1
            singleFile.local_mtime = mtime
            singleFile.permission = permissions
          } else {
            const { name, type, permissions, mtime, parent_dir } = item
            singleFile = {}
            singleFile.id = Math.random()
            singleFile.server_filename = name
            singleFile.parent = parent_dir
            singleFile.size = ''
            singleFile.parentsPath = parent_dir
            singleFile.path = `/${name}`
            singleFile.isdir = type == 'dir' ? 1 : 0
            singleFile.local_mtime = mtime
            singleFile.permission = permissions
          }
          data.push(singleFile)
        }
      })
    }
  },
}
